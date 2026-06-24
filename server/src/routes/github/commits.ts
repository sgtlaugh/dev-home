import { Router, Request, Response } from "express";
import { getConfig } from "../../config";
import { createGitHubClient } from "../../clients/githubApiClient";
import { graphql } from "../../clients/githubGraphqlClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import { LONG_CACHE_TTL, CACHE_FRESHNESS_MONTHS } from "../../utils/constants";
import { fetchUserRepos, fetchUserJoinDate, gateStartDate } from "./helpers";
import {
  getMonthsBetween,
  getCurrentYearMonth,
  isFullMonth,
  getCachedMonthlyStats,
  saveMonthlyStats,
} from "../../services/contributionCache";

const router = Router();

router.get("/user-info", async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    const github = createGitHubClient();
    const joinDate = await fetchUserJoinDate(github, config.githubUsername);
    res.json({ createdAt: joinDate ? `${joinDate}T00:00:00Z` : null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("UserInfo", message);
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});

function monthToRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${month}-01T00:00:00Z`,
    to: `${month}-${lastDay.toString().padStart(2, "0")}T23:59:59Z`,
  };
}

function getRecentRangeBounds(
  startDate: string,
  endDate: string,
  months: number,
): { start: string; end: string } | null {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  const end = new Date(endDate);

  // Range entirely in the past
  if (end < cutoff) return null;

  // Range entirely recent or spanning cutoff
  const start = new Date(startDate);
  const effectiveStart = start > cutoff ? startDate : cutoff.toISOString().slice(0, 10);
  return { start: effectiveStart, end: endDate };
}

router.get("/commits-search", async (req: Request, res: Response) => {
  const config = getConfig();
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ error: "Dates must be in YYYY-MM-DD format" });
  }

  const cacheKey = `github:commits-search:${startDate}:${endDate}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const currentMonth = getCurrentYearMonth();
  const allMonths = getMonthsBetween(startDate, endDate);
  const fullPastMonths = allMonths.filter(
    (m) => m < currentMonth && isFullMonth(startDate, endDate, m),
  );
  const partialMonths = allMonths.filter((m) => !fullPastMonths.includes(m));

  const dbCache = getCachedMonthlyStats(fullPastMonths);
  const missingMonths = fullPastMonths.filter((m) => !dbCache.has(m));

  let cachedCommitTotal = 0;
  let cachedReviewTotal = 0;
  for (const stats of dbCache.values()) {
    cachedCommitTotal += stats.commits;
    cachedReviewTotal += stats.reviews;
  }

  logger.info(
    "Commits",
    `${allMonths.length} months (${dbCache.size} cached, ${missingMonths.length} to fetch, ${partialMonths.length} partial)`,
  );

  const github = createGitHubClient();

  try {
    let contribCount = cachedCommitTotal;
    let reviewCount = cachedReviewTotal;

    const MONTHS_PER_BATCH = 12;
    for (let b = 0; b < missingMonths.length; b += MONTHS_PER_BATCH) {
      const batch = missingMonths.slice(b, b + MONTHS_PER_BATCH);
      const aliases = batch.map((month, i) => {
        const range = monthToRange(month);
        return `m${i}: contributionsCollection(from: "${range.from}", to: "${range.to}") { totalCommitContributions totalPullRequestReviewContributions }`;
      });
      const data = await graphql<{ viewer: Record<string, any> }>(
        `query { viewer { ${aliases.join("\n")} } }`,
        {},
        `commits/months-${b / MONTHS_PER_BATCH + 1}-of-${Math.ceil(missingMonths.length / MONTHS_PER_BATCH)}`,
      );
      for (let i = 0; i < batch.length; i++) {
        const entry = data.viewer?.[`m${i}`];
        const commits = entry?.totalCommitContributions || 0;
        const reviews = entry?.totalPullRequestReviewContributions || 0;
        saveMonthlyStats(batch[i], commits, reviews);
        contribCount += commits;
        reviewCount += reviews;
      }
    }

    // Fetch partial/current months
    for (const month of partialMonths) {
      const [y, m] = month.split("-").map(Number);
      const first = month === allMonths[0] ? startDate : `${month}-01`;
      const lastDayOfMonth = new Date(y, m, 0).getDate();
      const last =
        month === allMonths[allMonths.length - 1]
          ? endDate
          : `${month}-${lastDayOfMonth.toString().padStart(2, "0")}`;
      try {
        const data = await graphql<{
          viewer: {
            c: { totalCommitContributions: number; totalPullRequestReviewContributions: number };
          };
        }>(
          `query { viewer { c: contributionsCollection(from: "${first}T00:00:00Z", to: "${last}T23:59:59Z") { totalCommitContributions totalPullRequestReviewContributions } } }`,
          {},
          `commits/partial-${month}`,
        );
        contribCount += data.viewer?.c?.totalCommitContributions || 0;
        reviewCount += data.viewer?.c?.totalPullRequestReviewContributions || 0;
      } catch (err) {
        logger.error("Commits", `Failed to fetch partial ${month}: ${err}`);
      }
    }

    // Fork check: only check recent 3 months (forks rarely active in old ranges)
    let forkCount = 0;
    const forkRange = getRecentRangeBounds(startDate, endDate, CACHE_FRESHNESS_MONTHS);

    if (forkRange) {
      const effectiveStart = await gateStartDate(github, config.githubUsername, forkRange.start);
      const since = `${effectiveStart}T00:00:00Z`;
      const until = `${forkRange.end}T23:59:59Z`;

      logger.info(
        "Commits",
        `Fork check: ${effectiveStart}..${forkRange.end} (recent ${CACHE_FRESHNESS_MONTHS} months only)`,
      );

      // Split fork check into yearly chunks to avoid >1 year contributionsCollection limit
      const startYear = parseInt(effectiveStart.slice(0, 4), 10);
      const endYear = parseInt(forkRange.end.slice(0, 4), 10);
      const contribRepoNames = new Set<string>();
      let userId = "";

      for (let year = startYear; year <= endYear; year++) {
        const chunkFrom = year === startYear ? since : `${year}-01-01T00:00:00Z`;
        const chunkTo = year === endYear ? until : `${year}-12-31T23:59:59Z`;
        try {
          const data = await graphql<{
            viewer: {
              id: string;
              c: { commitContributionsByRepository: { repository: { nameWithOwner: string } }[] };
            };
          }>(
            `query { viewer { id c: contributionsCollection(from: "${chunkFrom}", to: "${chunkTo}") {
              commitContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner } }
            } } }`,
            {},
            `commits/fork-repos-${year}`,
          );
          userId = data.viewer?.id || userId;
          for (const entry of data.viewer?.c?.commitContributionsByRepository || []) {
            contribRepoNames.add(entry.repository.nameWithOwner.split("/")[1]);
          }
        } catch (err) {
          logger.warn("Commits", `Fork repo check failed for ${year}: ${err}`);
        }
      }

      // Cache fetchUserRepos for 24h
      const reposCacheKey = `user-repos:${config.githubUsername}`;
      let repos = apiCache.get<any[]>(reposCacheKey);
      if (!repos) {
        repos = await fetchUserRepos(github);
        apiCache.set(reposCacheKey, repos, LONG_CACHE_TTL);
      }

      // Filter user's fork repos
      const forkRepos = repos.filter(
        (r: any) =>
          r.fork &&
          r.owner.login === config.githubUsername &&
          r.pushed_at >= since &&
          !contribRepoNames.has(r.name),
      );

      const BATCH_SIZE = 10;
      const MAX_RETRIES = 2;

      for (let i = 0; i < forkRepos.length; i += BATCH_SIZE) {
        const batch = forkRepos.slice(i, i + BATCH_SIZE);
        const forkFragments = batch.map((repo: any, idx: number) => {
          const [owner, name] = repo.full_name.split("/");
          return `f${idx}: repository(owner: "${owner}", name: "${name}") {
            defaultBranchRef { target { ... on Commit {
              history(since: "${since}", until: "${until}", author: { id: "${userId}" }) { totalCount }
            } } }
          }`;
        });

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const forkData = await graphql(
              `query { ${forkFragments.join("\n")} }`,
              {},
              "commits/forks-batch",
            );
            for (let idx = 0; idx < batch.length; idx++) {
              const count = forkData[`f${idx}`]?.defaultBranchRef?.target?.history?.totalCount || 0;
              if (count > 0) logger.info("Commits", `fork ${batch[idx].full_name}: ${count}`);
              forkCount += count;
            }
            break;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (attempt < MAX_RETRIES) {
              logger.warn("Commits", `Fork batch retry ${attempt + 1}: ${message}`);
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            } else {
              logger.error(
                "Commits",
                `Fork batch DROPPED: ${batch.map((r: any) => r.full_name).join(", ")}`,
              );
            }
          }
        }
      }

      if (forkCount > 0)
        logger.info("Commits", `Forks: ${forkCount} from ${forkRepos.length} repos`);
    } else {
      logger.info(
        "Commits",
        `Skipping fork check (range end ${endDate} > ${CACHE_FRESHNESS_MONTHS} months ago)`,
      );
    }

    const totalCount = contribCount + forkCount;
    logger.info(
      "Commits",
      `Total: ${totalCount} (contributions: ${contribCount}, forks: ${forkCount})`,
    );

    const isPastRange = allMonths.every((m) => m < currentMonth);
    const responseData = { commitCount: totalCount, reviewCount };
    apiCache.set(cacheKey, responseData, isPastRange ? LONG_CACHE_TTL : undefined);
    res.json(responseData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("CommitsSearch", message);
    res.status(500).json({ error: "Failed to fetch commits data" });
  }
});

export default router;
