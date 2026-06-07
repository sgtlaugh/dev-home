import { Router, Request, Response } from "express";
import { getConfig } from "../../config";
import { graphql } from "../../clients/githubGraphqlClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import { ACTIVITY_LOOKBACK_DAYS, COMMENT_PREVIEW_LENGTH } from "../../utils/constants";
import { monthsAgo, mapGraphQLPr, isBot } from "./helpers";
import { SEARCH_PRS_QUERY, SEARCH_TEAM_ACTIVITY_QUERY } from "./queries";

const router = Router();

/**
 * GET /api/github/reviews
 * Fetch open PRs where the configured user's review is requested.
 */
router.get("/reviews", async (_req: Request, res: Response) => {
  const cacheKey = "github:reviews";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const config = getConfig();
  const q = `involves:${config.githubUsername} -author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  let result;
  try {
    result = await graphql<{ search: { nodes: any[] } }>(SEARCH_PRS_QUERY, {
      query: q,
      first: 50,
    }, "reviews/requested");
  } catch (error) {
    logger.error("GET /reviews", `GraphQL error: ${error}`);
    return res.status(500).json({ error: "Failed to fetch reviews" });
  }

  if (!result?.search) {
    logger.warn("GET /reviews", "Missing search in response");
    return res.status(500).json({ error: "Invalid response from GitHub API" });
  }

  const reviews = (result.search.nodes || [])
    .map(mapGraphQLPr)
    .filter((pr: any) => pr.state === "open")
    .sort(
      (a: any, b: any) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

  const responseData = { reviews };
  apiCache.set(cacheKey, responseData);
  res.json(responseData);
});

/**
 * GET /api/github/team-activity
 * Fetch reviews and comments from peers on user's PRs and involved PRs.
 */
router.get("/team-activity", async (req: Request, res: Response) => {
  const cacheKey = "github:team-activity";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const config = getConfig();
    const username = config.githubUsername;

    const [myPRsResult, involvedPRsResult] = await Promise.all([
      graphql<{ search: { nodes: any[] } }>(SEARCH_TEAM_ACTIVITY_QUERY, {
        query: `author:${username} type:pr updated:>=${monthsAgo(
          Math.ceil(ACTIVITY_LOOKBACK_DAYS / 30),
        )}`,
        first: 100,
      }, "team-activity/my-prs"),
      graphql<{ search: { nodes: any[] } }>(SEARCH_TEAM_ACTIVITY_QUERY, {
        query: `involves:${username} -author:${username} type:pr updated:>=${monthsAgo(
          Math.ceil(ACTIVITY_LOOKBACK_DAYS / 30),
        )}`,
        first: 100,
      }, "team-activity/involved-prs"),
    ]);

    const myPRNodes = myPRsResult.search.nodes || [];
    const involvedPRNodes = involvedPRsResult.search.nodes || [];
    logger.info("TeamActivity", `myPRs: ${myPRNodes.length}, involvedPRs: ${involvedPRNodes.length}`);

    const seen = new Set<string>();
    const allPRNodes: any[] = [];
    for (const pr of [...myPRNodes, ...involvedPRNodes]) {
      if (seen.has(pr.url)) continue;
      seen.add(pr.url);
      allPRNodes.push(pr);
    }

    const activities: any[] = [];

    for (const pr of allPRNodes) {
      const repoName = pr.repository?.nameWithOwner || "";
      const prTitle = `${repoName}#${pr.number}: ${pr.title}`;
      const entityKey = `${repoName}#${pr.number}`;
      const prState = pr.merged ? "merged" : pr.state === "CLOSED" ? "closed" : "open";

      // Track if a peer merged this PR
      if (pr.merged && pr.mergedBy?.login && pr.mergedBy.login !== username && !isBot(pr.mergedBy.login)) {
        activities.push({
          id: `peer-merge-${pr.number}-${pr.mergedBy.login}-${pr.mergedAt}`,
          type: "github",
          action: "Merged PR",
          title: prTitle,
          url: pr.url,
          timestamp: pr.mergedAt,
          entityKey,
          metadata: {
            actor: { login: pr.mergedBy.login, avatar_url: pr.mergedBy.avatarUrl },
            repo: repoName,
            prState,
          },
        });
      }

      for (const review of pr.reviews?.nodes || []) {
        const login = review.author?.login;
        if (!login || login === username || isBot(login)) continue;

        let action: string;
        let commentBody: string | undefined;

        if (review.state === "APPROVED") {
          action = "Approved PR";
        } else if (review.state === "CHANGES_REQUESTED") {
          action = "Changes Requested";
        } else if (review.state === "COMMENTED") {
          // Only show COMMENTED reviews if they have a body (review-level comment)
          const body = review.body?.trim() || "";
          if (!body) continue;
          action = "Commented on PR";
          const trimmed = body.slice(0, COMMENT_PREVIEW_LENGTH);
          commentBody = trimmed + (body.length > COMMENT_PREVIEW_LENGTH ? "..." : "");
        } else {
          continue;
        }

        activities.push({
          id: `peer-review-${pr.number}-${login}-${review.submittedAt}`,
          type: "github",
          action,
          title: prTitle,
          url: pr.url,
          timestamp: review.submittedAt,
          entityKey,
          metadata: {
            actor: { login, avatar_url: review.author.avatarUrl },
            repo: repoName,
            prState,
            commentBody,
          },
        });
      }

      for (const comment of pr.comments?.nodes || []) {
        const login = comment.author?.login;
        if (!login || login === username || isBot(login)) continue;

        const body = comment.body || "";
        const trimmed = body.slice(0, COMMENT_PREVIEW_LENGTH);
        const commentPreview = trimmed + (body.length > COMMENT_PREVIEW_LENGTH ? "..." : "");
        activities.push({
          id: `peer-comment-${pr.number}-${login}-${comment.createdAt}`,
          type: "github",
          action: "Commented on PR",
          title: prTitle,
          url: comment.url || pr.url,
          timestamp: comment.createdAt,
          entityKey,
          metadata: {
            actor: { login, avatar_url: comment.author.avatarUrl },
            repo: repoName,
            commentBody: commentPreview,
            prState,
          },
        });
      }

      for (const thread of pr.reviewThreads?.nodes || []) {
        for (const comment of thread.comments?.nodes || []) {
          const login = comment.author?.login;
          if (!login || login === username || isBot(login)) continue;

          const body = comment.body || "";
          const trimmed = body.slice(0, COMMENT_PREVIEW_LENGTH);
          const commentPreview = trimmed + (body.length > COMMENT_PREVIEW_LENGTH ? "..." : "");
          activities.push({
            id: `peer-thread-${pr.number}-${login}-${comment.createdAt}`,
            type: "github",
            action: "Commented on PR",
            title: prTitle,
            url: comment.url || pr.url,
            timestamp: comment.createdAt,
            entityKey,
            metadata: {
              actor: { login, avatar_url: comment.author.avatarUrl },
              repo: repoName,
              commentBody: commentPreview,
              prState,
            },
          });
        }
      }
    }

    activities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    logger.info(
      "TeamActivity",
      `found ${activities.length} peer activities from ${allPRNodes.length} PRs`,
    );

    const responseData = { activities };
    apiCache.set(cacheKey, responseData);
    res.json(responseData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("TeamActivity", message);
    res.status(500).json({ error: "Failed to fetch team activity" });
  }
});

export default router;
