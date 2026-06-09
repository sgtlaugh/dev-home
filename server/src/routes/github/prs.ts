import { Router, Request, Response } from "express";
import { getConfig } from "../../config";
import { graphql } from "../../clients/githubGraphqlClient";
import { createGitHubClient } from "../../clients/githubApiClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import {
  monthsAgo,
  mapGraphQLPr,
  extractOwnPRComments,
  buildYearRanges,
  fetchPRsForSubRange,
  gateStartDate,
} from "./helpers";
import { SEARCH_PRS_QUERY } from "./queries";
import { LONG_CACHE_TTL } from "../../utils/constants";
import {
  getMonthsBetween,
  getCurrentYearMonth,
  isFullMonth,
  getCachedPRs,
  savePRs,
} from "../../services/contributionCache";

const router = Router();
const PARALLEL_BATCH = 4;

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

router.get("/prs", async (_req: Request, res: Response) => {
  const cacheKey = "github:prs";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const config = getConfig();
  const q = `author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  let result;
  try {
    result = await graphql<{ search: { nodes: any[] } }>(SEARCH_PRS_QUERY, {
      query: q,
      first: 50,
    }, "prs/open");
  } catch (error) {
    logger.error("GET /prs", `GraphQL error: ${error}`);
    return res.status(500).json({ error: "Failed to fetch PRs" });
  }

  if (!result?.search) {
    logger.warn("GET /prs", "Missing search in response");
    return res.status(500).json({ error: "Invalid response from GitHub API" });
  }

  const nodes = result.search.nodes || [];
  const prs = nodes
    .map(mapGraphQLPr)
    .filter((pr: any) => pr.state === "open")
    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const prComments = extractOwnPRComments(nodes, config.githubUsername);

  const responseData = { prs, pr_comments: prComments };
  apiCache.set(cacheKey, responseData);
  res.json(responseData);
});

router.get("/prs-by-date-range", async (req: Request, res: Response) => {
  const config = getConfig();
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ error: "Dates must be in YYYY-MM-DD format" });
  }

  const cacheKey = `github:prs-by-date:${startDate}:${endDate}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const currentMonth = getCurrentYearMonth();
  const allMonths = getMonthsBetween(startDate, endDate);
  const cacheableMonths = allMonths.filter(
    (m) => isFullMonth(startDate, endDate, m) && m < currentMonth,
  );
  const uncacheableMonths = allMonths.filter((m) => !cacheableMonths.includes(m));

  const dbCache = getCachedPRs(cacheableMonths);
  const missingCacheableMonths = cacheableMonths.filter((m) => !dbCache.has(m));

  const cachedPRs: any[] = [];
  for (const prs of dbCache.values()) cachedPRs.push(...prs);

  logger.info(
    "PRs",
    `${allMonths.length} months (${dbCache.size} cached, ${missingCacheableMonths.length} to fetch, ${uncacheableMonths.length} recent/partial)`,
  );

  const github = createGitHubClient();
  const effectiveStart = await gateStartDate(github, config.githubUsername, startDate);
  const currentYear = new Date().getFullYear();
  const monthsToFetch = [...missingCacheableMonths, ...uncacheableMonths].sort();
  const cachedMonthSet = new Set(cacheableMonths.filter((m) => dbCache.has(m)));

  let fetchedPRs: any[] = [];
  if (monthsToFetch.length > 0) {
    const fetchStart = monthsToFetch[0] < effectiveStart.slice(0, 7) ? effectiveStart : `${monthsToFetch[0]}-01`;
    const lastMonth = monthsToFetch[monthsToFetch.length - 1];
    const [ly, lm] = lastMonth.split("-").map(Number);
    const fetchEnd = lastMonth === currentMonth
      ? endDate
      : `${lastMonth}-${new Date(ly, lm, 0).getDate().toString().padStart(2, "0")}`;

    const yearRanges = buildYearRanges(fetchStart, fetchEnd);
    const seen = new Set<string>();

    for (let i = 0; i < yearRanges.length; i += PARALLEL_BATCH) {
      const batch = yearRanges.slice(i, i + PARALLEL_BATCH);
      const results = await Promise.all(batch.map(async (range) => {
        const rangeYear = parseInt(range.start.slice(0, 4), 10);
        if (rangeYear > currentYear) return [];

        const yearCacheKey = `github:prs-year:${config.githubUsername}:${range.start}:${range.end}`;
        const yearCached = apiCache.get<any[]>(yearCacheKey);
        if (yearCached) return yearCached;

        const nodes = await fetchPRsForSubRange(config.githubUsername, range.start, range.end);
        apiCache.set(yearCacheKey, nodes, rangeYear < currentYear ? LONG_CACHE_TTL : undefined);
        return nodes;
      }));

      for (const nodes of results) {
        for (const node of nodes) {
          const id = node.url || node.id;
          if (!seen.has(id)) {
            seen.add(id);
            fetchedPRs.push(node);
          }
        }
      }
    }

    fetchedPRs = fetchedPRs.map(mapGraphQLPr);
    const buckets = bucketPRsByMonth(fetchedPRs);
    for (const month of missingCacheableMonths) {
      savePRs(month, buckets.get(month) || []);
    }
  }

  const cachedIds = new Set(cachedPRs.map((pr: any) => pr.html_url || pr.url || pr.id));
  const dedupedFetched = fetchedPRs.filter((pr: any) => {
    const id = pr.html_url || pr.url || pr.id;
    return !cachedIds.has(id);
  });

  const allPRs = [...cachedPRs, ...dedupedFetched];
  logger.info("PRs", `${allPRs.length} PRs for ${startDate}..${endDate} (${cachedPRs.length} cached, ${dedupedFetched.length} fetched)`);

  const responseData = { prs: allPRs };
  apiCache.set(cacheKey, responseData);
  res.json(responseData);
});

export default router;
