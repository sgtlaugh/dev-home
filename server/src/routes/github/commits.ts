import { Router, Request, Response } from "express";
import { getConfig } from "../../config";
import { createGitHubClient } from "../../clients/githubApiClient";
import { graphql } from "../../clients/githubGraphqlClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import {
  buildYearChunks,
  fetchUserRepos,
  fetchUserJoinDate,
  gateStartDate,
} from "./helpers";

const router = Router();
const LONG_CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * GET /api/github/user-info
 * Fetch user's join date for "All Time" range bounds.
 */
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

/**
 * GET /api/github/commits-search
 * Fetch contributionsCollection and fork commit history for a date range.
 */
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

  const github = createGitHubClient();

  try {
    const effectiveStart = await gateStartDate(github, config.githubUsername, startDate);
    const since = `${effectiveStart}T00:00:00Z`;
    const until = `${endDate}T23:59:59Z`;
    const chunks = buildYearChunks(effectiveStart, endDate);

    const fragments = chunks.map(
      (c) => `${c.alias}: contributionsCollection(from: "${c.from}", to: "${c.to}") {
        totalCommitContributions
        commitContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner }
          contributions { totalCount }
        }
      }`,
    );
    const contribQuery = `query { viewer { id ${fragments.join("\n")} } }`;

    const [contribData, repos] = await Promise.all([
      graphql<{ viewer: Record<string, any> }>(contribQuery, {}, "commits/contributions"),
      fetchUserRepos(github),
    ]);

    const userId = contribData.viewer?.id;

    let contribCount = 0;
    const repoTotals = new Map<string, number>();

    for (const chunk of chunks) {
      const collection = contribData.viewer?.[chunk.alias];
      contribCount += collection?.totalCommitContributions || 0;

      for (const entry of collection?.commitContributionsByRepository || []) {
        const repoName = entry.repository?.nameWithOwner || "unknown";
        const count = entry.contributions?.totalCount || 0;
        repoTotals.set(repoName, (repoTotals.get(repoName) || 0) + count);
      }
    }

    logger.info("Commits", `contributionsCollection: ${contribCount} (${chunks.length} chunks)`);

    const contribRepoNames = new Set([...repoTotals.keys()].map((n) => n.split("/")[1]));

    const forkRepos = repos.filter(
      (r: any) =>
        r.fork &&
        r.owner.login === config.githubUsername &&
        r.pushed_at >= since &&
        !contribRepoNames.has(r.name),
    );

    let forkCount = 0;
    const BATCH_SIZE = 10;
    const MAX_RETRIES = 2;

    for (let i = 0; i < forkRepos.length; i += BATCH_SIZE) {
      const batch = forkRepos.slice(i, i + BATCH_SIZE);
      const forkFragments = batch.map((repo: any, idx: number) => {
        const [owner, name] = repo.full_name.split("/");
        return `f${idx}: repository(owner: "${owner}", name: "${name}") {
          defaultBranchRef {
            target {
              ... on Commit {
                history(since: "${since}", until: "${until}", author: { id: "${userId}" }) {
                  totalCount
                }
              }
            }
          }
        }`;
      });

      const forkQuery = `query { ${forkFragments.join("\n")} }`;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const forkData = await graphql(forkQuery, {}, `commits/forks-batch`);
          for (let idx = 0; idx < batch.length; idx++) {
            const count =
              forkData[`f${idx}`]?.defaultBranchRef?.target?.history?.totalCount || 0;
            if (count > 0) {
              logger.info("Commits", `fork ${batch[idx].full_name}: ${count}`);
              repoTotals.set(
                batch[idx].full_name,
                (repoTotals.get(batch[idx].full_name) || 0) + count,
              );
            }
            forkCount += count;
          }
          break;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (attempt < MAX_RETRIES) {
            logger.warn("Commits", `Fork batch retry ${attempt + 1}: ${message}`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          } else {
            logger.error(
              "Commits",
              `Fork batch DROPPED: ${batch.map((r: any) => r.full_name).join(", ")}`,
            );
          }
        }
      }
    }

    if (forkCount > 0) {
      logger.info("Commits", `Forks: ${forkCount} from ${forkRepos.length} repos`);
    }

    const totalCount = contribCount + forkCount;

    const sortedRepos = [...repoTotals.entries()].sort((a, b) => b[1] - a[1]);
    for (const [repo, count] of sortedRepos.slice(0, 20)) {
      logger.info("Commits", `${repo}: ${count}`);
    }
    if (sortedRepos.length > 20) {
      logger.info("Commits", `... and ${sortedRepos.length - 20} more repos`);
    }

    logger.info(
      "Commits",
      `Total: ${totalCount} (contributions: ${contribCount}, forks: ${forkCount})`,
    );
    const responseData = { commitCount: totalCount };
    const endYear = parseInt(endDate.slice(0, 4), 10);
    const isPastRange = endYear < new Date().getFullYear();
    apiCache.set(cacheKey, responseData, isPastRange ? LONG_CACHE_TTL : undefined);
    res.json(responseData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("CommitsSearch", message);
    res.status(500).json({ error: "Failed to fetch commits data" });
  }
});

export default router;
