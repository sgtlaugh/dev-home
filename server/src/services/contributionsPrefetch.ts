import { getConfig } from "../config";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import { apiCache } from "../utils/cache";
import { LONG_CACHE_TTL } from "../utils/constants";
import { logger } from "../utils/logger";
import {
  getMonthsBetween,
  getCachedPRs,
  savePRs,
  getCachedCommitCounts,
  saveCommitCount,
  bustRecentCommitCounts,
} from "./contributionCache";
import {
  fetchUserJoinDate,
  buildYearRanges,
  fetchPRsForSubRange,
  mapGraphQLPr,
} from "../routes/github/helpers";

const PARALLEL_BATCH = 4;
const MONTHS_PER_BATCH = 12;

const BUST_RECENT_MONTHS = 2;

function getRecentMonths(n: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`);
  }
  return months;
}

function bucketPRsByMonth(prs: any[]): Map<string, any[]> {
  const buckets = new Map<string, any[]>();
  for (const pr of prs) {
    const date = pr.created_at || pr.createdAt;
    if (!date) continue;
    const ym = date.slice(0, 7);
    if (!buckets.has(ym)) buckets.set(ym, []);
    buckets.get(ym)!.push(pr);
  }
  return buckets;
}

export async function prefetchContributions(): Promise<void> {
  const config = getConfig();
  const username = config.githubUsername;
  if (!username) return;

  const github = createGitHubClient();
  const joinDate = await fetchUserJoinDate(github, username);
  if (!joinDate) {
    logger.warn("ContribPrefetch", "Could not determine join date, skipping");
    return;
  }

  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endMonth = `${prevMonth.getFullYear()}-${(prevMonth.getMonth() + 1).toString().padStart(2, "0")}`;
  const allMonths = getMonthsBetween(joinDate, `${endMonth}-28`);

  const recentMonths = getRecentMonths(BUST_RECENT_MONTHS);
  bustRecentCommitCounts(recentMonths);
  logger.info("ContribPrefetch", `Busted cache for recent months: ${recentMonths.join(", ")}`);

  if (allMonths.length === 0) {
    logger.info("ContribPrefetch", "No months to prefetch");
    return;
  }

  // Check what's already cached
  const cachedPRMonths = getCachedPRs(allMonths);
  const cachedCommitMonths = getCachedCommitCounts(allMonths);

  const missingPRMonths = allMonths.filter((m) => !cachedPRMonths.has(m));
  const missingCommitMonths = allMonths.filter((m) => !cachedCommitMonths.has(m));

  if (missingPRMonths.length === 0 && missingCommitMonths.length === 0) {
    logger.info("ContribPrefetch", `All ${allMonths.length} months cached, nothing to do`);
    return;
  }

  logger.info(
    "ContribPrefetch",
    `${allMonths.length} months total, missing: ${missingPRMonths.length} PR months, ${missingCommitMonths.length} commit months`,
  );

  // Prefetch PRs
  if (missingPRMonths.length > 0) {
    await prefetchPRs(username, missingPRMonths);
  }

  // Prefetch commits
  if (missingCommitMonths.length > 0) {
    await prefetchCommits(missingCommitMonths);
  }

  logger.info("ContribPrefetch", "Done");
}

async function prefetchPRs(username: string, months: string[]): Promise<void> {
  const sortedMonths = [...months].sort();
  const fetchStart = `${sortedMonths[0]}-01`;
  const lastMonth = sortedMonths[sortedMonths.length - 1];
  const [ly, lm] = lastMonth.split("-").map(Number);
  const fetchEnd = `${lastMonth}-${new Date(ly, lm, 0).getDate().toString().padStart(2, "0")}`;

  logger.info("ContribPrefetch", `Fetching PRs: ${fetchStart}..${fetchEnd}`);

  const yearRanges = buildYearRanges(fetchStart, fetchEnd);
  const allPRs: any[] = [];
  const seen = new Set<string>();
  const currentYear = new Date().getFullYear();

  for (let i = 0; i < yearRanges.length; i += PARALLEL_BATCH) {
    const batch = yearRanges.slice(i, i + PARALLEL_BATCH);
    const results = await Promise.all(
      batch.map(async (range) => {
        const rangeYear = parseInt(range.start.slice(0, 4), 10);
        if (rangeYear > currentYear) return [];

        const yearCacheKey = `github:prs-year:${username}:${range.start}:${range.end}`;
        const yearCached = apiCache.get<any[]>(yearCacheKey);
        if (yearCached) return yearCached;

        const nodes = await fetchPRsForSubRange(`author:${username} type:pr`, range.start, range.end);
        apiCache.set(yearCacheKey, nodes, LONG_CACHE_TTL);
        return nodes;
      }),
    );

    for (const nodes of results) {
      for (const node of nodes) {
        const id = node.url || node.id;
        if (!seen.has(id)) {
          seen.add(id);
          allPRs.push(node);
        }
      }
    }
  }

  const mapped = allPRs.map(mapGraphQLPr);
  const buckets = bucketPRsByMonth(mapped);
  const monthSet = new Set(months);

  for (const month of monthSet) {
    savePRs(month, buckets.get(month) || []);
  }

  logger.info("ContribPrefetch", `Cached ${mapped.length} PRs across ${months.length} months`);
}

async function prefetchCommits(months: string[]): Promise<void> {
  logger.info("ContribPrefetch", `Fetching commits for ${months.length} months`);

  for (let b = 0; b < months.length; b += MONTHS_PER_BATCH) {
    const batch = months.slice(b, b + MONTHS_PER_BATCH);
    const aliases = batch.map((month, i) => {
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      return `m${i}: contributionsCollection(from: "${month}-01T00:00:00Z", to: "${month}-${lastDay.toString().padStart(2, "0")}T23:59:59Z") { totalCommitContributions }`;
    });

    try {
      const data = await graphql<{ viewer: Record<string, any> }>(
        `query { viewer { ${aliases.join("\n")} } }`,
        {},
        `contrib-prefetch/commits-${b / MONTHS_PER_BATCH + 1}-of-${Math.ceil(months.length / MONTHS_PER_BATCH)}`,
      );
      for (let i = 0; i < batch.length; i++) {
        const count = data.viewer?.[`m${i}`]?.totalCommitContributions || 0;
        saveCommitCount(batch[i], count);
      }
    } catch (err) {
      logger.error("ContribPrefetch", `Commit batch failed: ${err}`);
    }
  }

  logger.info("ContribPrefetch", `Cached commits for ${months.length} months`);
}
