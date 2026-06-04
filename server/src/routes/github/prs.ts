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
import { SEARCH_MY_PRS_QUERY } from "./queries";

const router = Router();
const LONG_CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * GET /api/github/prs
 * Fetch user's open PRs with review status and comments.
 */
router.get("/prs", async (_req: Request, res: Response) => {
  const cacheKey = "github:prs";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const config = getConfig();
  const q = `author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  let result;
  try {
    result = await graphql<{ search: { nodes: any[] } }>(SEARCH_MY_PRS_QUERY, {
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
    .sort(
      (a: any, b: any) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  const prComments = extractOwnPRComments(nodes, config.githubUsername);

  const responseData = { prs, pr_comments: prComments };
  apiCache.set(cacheKey, responseData);
  res.json(responseData);
});

/**
 * GET /api/github/prs-by-date-range
 * Fetch historical PRs in a date range, year-chunked with recursion to handle 1000-result cap.
 */
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

  const github = createGitHubClient();
  const effectiveStart = await gateStartDate(github, config.githubUsername, startDate);
  const yearRanges = buildYearRanges(effectiveStart, endDate);
  const currentYear = new Date().getFullYear();
  const PARALLEL_BATCH = 4;

  async function fetchYearRange(range: { start: string; end: string }): Promise<any[]> {
    const rangeYear = parseInt(range.start.slice(0, 4), 10);
    if (rangeYear > currentYear) return [];

    const yearCacheKey = `github:prs-year:${config.githubUsername}:${range.start}:${range.end}`;
    const yearCached = apiCache.get<any[]>(yearCacheKey);
    if (yearCached) return yearCached;

    const nodes = await fetchPRsForSubRange(config.githubUsername, range.start, range.end);
    apiCache.set(
      yearCacheKey,
      nodes,
      rangeYear < currentYear ? LONG_CACHE_TTL : undefined,
    );
    return nodes;
  }

  const allPrs: any[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < yearRanges.length; i += PARALLEL_BATCH) {
    const batch = yearRanges.slice(i, i + PARALLEL_BATCH);
    const results = await Promise.all(batch.map(fetchYearRange));
    for (const nodes of results) {
      for (const pr of nodes) {
        const id = pr.url || pr.id;
        if (!seen.has(id)) {
          seen.add(id);
          allPrs.push(pr);
        }
      }
    }
  }

  const prs = allPrs.map(mapGraphQLPr);
  logger.info("PRs", `${prs.length} PRs for ${startDate}..${endDate}`);

  const responseData = { prs };
  apiCache.set(cacheKey, responseData);
  res.json(responseData);
});

export default router;
