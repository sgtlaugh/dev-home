import { Router, Request, Response } from "express";
import { getConfig } from "../../config";
import { graphql, getLastRateLimit } from "../../clients/githubGraphqlClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import {
  monthsAgo,
  mapGraphQLPr,
  extractOwnPRComments,
} from "./helpers";
import { COMBINED_DASHBOARD_QUERY } from "./queries";
import prsRouter from "./prs";
import reviewsRouter from "./reviews";
import commitsRouter from "./commits";
import mentionsRouter from "./mentions";
import leaderboardRouter from "./leaderboard";

const router = Router();

/**
 * GET /api/github/dashboard
 * Fetch both PRs and review requests in a single GraphQL query.
 */
router.get("/dashboard", async (_req: Request, res: Response) => {
  const cacheKey = "github:dashboard";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const config = getConfig();
  const myPRsQuery = `author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;
  const reviewsQuery = `involves:${config.githubUsername} -author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  let result;
  try {
    result = await graphql<{
      myPRs: { nodes: any[] };
      reviews: { nodes: any[] };
    }>(COMBINED_DASHBOARD_QUERY, {
      myPRsQuery,
      reviewsQuery,
      first: 50,
    }, "dashboard/prs+reviews");
  } catch (error) {
    logger.error("GET /dashboard", `GraphQL error: ${error}`);
    return res.status(500).json({ error: "Failed to fetch dashboard data" });
  }

  if (!result?.myPRs || !result?.reviews) {
    logger.warn("GET /dashboard", "Missing myPRs or reviews in response");
    return res.status(500).json({ error: "Invalid response from GitHub API" });
  }

  const myPRsNodes = result.myPRs.nodes || [];
  const prs = myPRsNodes
    .map(mapGraphQLPr)
    .filter((pr: any) => pr.state === "open")
    .sort(
      (a: any, b: any) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  const prComments = extractOwnPRComments(myPRsNodes, config.githubUsername);

  const reviewsNodes = result.reviews.nodes || [];
  const reviews = reviewsNodes
    .map(mapGraphQLPr)
    .filter((pr: any) => pr.state === "open")
    .sort(
      (a: any, b: any) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

  const responseData = { prs, pr_comments: prComments, reviews };
  apiCache.set(cacheKey, responseData);
  res.json(responseData);
});

/**
 * GET /api/github/rate-limit
 * Get current GitHub GraphQL API rate limit status
 */
router.get("/rate-limit", async (_req: Request, res: Response) => {
  let rateLimit = getLastRateLimit();
  if (!rateLimit) {
    try {
      await graphql("query { viewer { login } }", {}, "rate-limit/probe");
      rateLimit = getLastRateLimit();
    } catch {
      // ignore
    }
  }
  res.json({ rateLimit });
});

// Mount sub-routers
router.use(prsRouter);
router.use(reviewsRouter);
router.use(commitsRouter);
router.use(mentionsRouter);
router.use(leaderboardRouter);

export default router;
