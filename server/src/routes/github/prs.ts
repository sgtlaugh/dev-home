import { Router, Request, Response } from "express";
import { getConfig } from "../../config";
import { graphql } from "../../clients/githubGraphqlClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import { monthsAgo, mapGraphQLPr, extractOwnPRComments } from "./helpers";
import { SEARCH_PRS_QUERY } from "./queries";
import { getAuthoredPRsByDateRange, getWatermark } from "../../services/prStore";

const router = Router();

router.get("/prs", async (_req: Request, res: Response) => {
  const cacheKey = "github:prs";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const config = getConfig();
  const q = `author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  let result;
  try {
    result = await graphql<{ search: { nodes: any[] } }>(
      SEARCH_PRS_QUERY,
      {
        query: q,
        first: 50,
      },
      "prs/open",
    );
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
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate are required" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ error: "Dates must be in YYYY-MM-DD format" });
  }

  const watermark = getWatermark("prs_author");
  if (!watermark) {
    logger.info("PRs", `Sync pending, returning syncPending for ${startDate}..${endDate}`);
    return res.json({ prs: [], syncPending: true });
  }

  const prs = getAuthoredPRsByDateRange(startDate, endDate);
  logger.info("PRs", `${prs.length} PRs for ${startDate}..${endDate} (from DB)`);
  res.json({ prs });
});

export default router;
