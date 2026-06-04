import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import { apiCache } from "../utils/cache";
import { logger } from "../utils/logger";
import { ACTIVITY_LOOKBACK_DAYS, COMMENT_PREVIEW_LENGTH } from "../utils/constants";

const router = Router();

/**
 * Get an ISO date string for three months ago (YYYY-MM-DD).
 */
function monthsAgo(months: number = 1): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const SEARCH_PRS_QUERY = `
  query SearchPRs($query: String!, $first: Int!) {
    search(query: $query, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          state
          isDraft
          merged
          mergedAt
          closedAt
          createdAt
          updatedAt
          author { login avatarUrl }
          body
          headRefName
          baseRefName
          repository { nameWithOwner url }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Extended query for user's own PRs. Adds review state and recent comments
 * so we can show approval status and surface comments without extra REST calls.
 */
const SEARCH_MY_PRS_QUERY = `
  query SearchMyPRs($query: String!, $first: Int!, $after: String) {
    search(query: $query, type: ISSUE, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          state
          isDraft
          merged
          mergedAt
          closedAt
          createdAt
          updatedAt
          author { login avatarUrl }
          body
          headRefName
          baseRefName
          repository { nameWithOwner url }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
                }
              }
            }
          }
          reviews(last: 20) {
            nodes {
              state
              author { login avatarUrl }
              submittedAt
            }
          }
          comments(last: 50) {
            nodes {
              databaseId
              url
              body
              createdAt
              updatedAt
              author { login avatarUrl }
            }
          }
          reviewThreads(last: 50) {
            nodes {
              comments(last: 10) {
                nodes {
                  databaseId
                  url
                  body
                  createdAt
                  updatedAt
                  author { login avatarUrl }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Map a statusCheckRollup context node to a normalized check run shape.
 */
function mapCheckContext(ctx: any) {
  // CheckRun nodes have `name`, `conclusion`, `status`, `detailsUrl`
  if (ctx.name !== undefined) {
    return {
      name: ctx.name,
      status: (ctx.conclusion || ctx.status || "PENDING").toUpperCase(),
      url: ctx.detailsUrl || null,
    };
  }
  // StatusContext nodes have `context`, `state`, `targetUrl`
  return {
    name: ctx.context || "",
    status: (ctx.state || "PENDING").toUpperCase(),
    url: ctx.targetUrl || null,
  };
}

/**
 * Derive an overall review status from a list of review nodes.
 * Returns "APPROVED", "CHANGES_REQUESTED", "REVIEWED", or null.
 * Uses the latest review per author to determine the current state.
 */
function deriveReviewStatus(reviews: any[] | undefined): string | null {
  if (!reviews || reviews.length === 0) return null;

  // Keep only the latest review per author
  const latestByAuthor = new Map<string, string>();
  for (const r of reviews) {
    const login = r.author?.login || "";
    if (!login) continue;
    // reviews are ordered oldest-first from the API; later entries overwrite
    latestByAuthor.set(login, r.state);
  }

  const states = [...latestByAuthor.values()];
  if (states.some((s) => s === "CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (states.some((s) => s === "APPROVED")) return "APPROVED";
  if (states.length > 0) return "REVIEWED";
  return null;
}

/**
 * Map a GitHub GraphQL PullRequest node to the frontend GitHubPR shape.
 */
function mapGraphQLPr(node: any) {
  const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  const contextNodes = rollup?.contexts?.nodes || [];
  return {
    id: node.databaseId,
    number: node.number,
    title: node.title,
    html_url: node.url,
    state: node.state?.toLowerCase() || "open",
    draft: node.isDraft || false,
    merged: node.merged || false,
    merged_at: node.mergedAt || null,
    closed_at: node.closedAt || null,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
    user: {
      login: node.author?.login || "",
      avatar_url: node.author?.avatarUrl || "",
    },
    head: {
      ref: node.headRefName || "",
    },
    base: {
      ref: node.baseRefName || "",
    },
    body: node.body || "",
    repository_url: `https://api.github.com/repos/${node.repository?.nameWithOwner || ""}`,
    repo_full_name: node.repository?.nameWithOwner || "",
    checks_status: rollup?.state || null,
    checks: contextNodes.map(mapCheckContext),
    review_status: deriveReviewStatus(node.reviews?.nodes),
  };
}

const COMBINED_DASHBOARD_QUERY = `
  query CombinedDashboard($myPRsQuery: String!, $reviewsQuery: String!, $first: Int!) {
    myPRs: search(query: $myPRsQuery, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          state
          isDraft
          merged
          mergedAt
          closedAt
          createdAt
          updatedAt
          author { login avatarUrl }
          body
          headRefName
          baseRefName
          repository { nameWithOwner url }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
                }
              }
            }
          }
          reviews(last: 20) {
            nodes {
              state
              author { login avatarUrl }
              submittedAt
            }
          }
          comments(last: 50) {
            nodes {
              databaseId
              url
              body
              createdAt
              updatedAt
              author { login avatarUrl }
            }
          }
          reviewThreads(last: 50) {
            nodes {
              comments(last: 10) {
                nodes {
                  databaseId
                  url
                  body
                  createdAt
                  updatedAt
                  author { login avatarUrl }
                }
              }
            }
          }
        }
      }
    }
    reviews: search(query: $reviewsQuery, type: ISSUE, first: $first) {
      nodes {
        ... on PullRequest {
          databaseId
          number
          title
          url
          state
          isDraft
          merged
          mergedAt
          closedAt
          createdAt
          updatedAt
          author { login avatarUrl }
          body
          headRefName
          baseRefName
          repository { nameWithOwner url }
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                  contexts(first: 50) {
                    nodes {
                      ... on CheckRun {
                        name
                        conclusion
                        status
                        detailsUrl
                      }
                      ... on StatusContext {
                        context
                        state
                        targetUrl
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

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
  const reviewsQuery = `review-requested:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  const result = await graphql<{
    myPRs: { nodes: any[] };
    reviews: { nodes: any[] };
  }>(COMBINED_DASHBOARD_QUERY, {
    myPRsQuery,
    reviewsQuery,
    first: 50,
  });

  const myPRsNodes = result.myPRs.nodes || [];
  const prs = myPRsNodes
    .map(mapGraphQLPr)
    .filter((pr: any) => pr.state === "open")
    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const prComments = extractOwnPRComments(myPRsNodes, config.githubUsername);

  const reviewsNodes = result.reviews.nodes || [];
  const reviews = reviewsNodes
    .map(mapGraphQLPr)
    .filter((pr: any) => pr.state === "open")
    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const responseData = { prs, pr_comments: prComments, reviews };
  apiCache.set(cacheKey, responseData);
  res.json(responseData);
});

/**
 * GET /api/github/prs
 * Fetch open pull requests authored by the configured user.
 * Uses the extended query to include review/approval status and comments.
 * Also returns pr_comments: comments on the user's PRs by other people (non-bot),
 * so the frontend can merge them into mentions without a second GraphQL call.
 */
router.get("/prs", async (_req: Request, res: Response) => {
  const cacheKey = "github:prs";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const config = getConfig();
  const q = `author:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  const result = await graphql<{ search: { nodes: any[] } }>(SEARCH_MY_PRS_QUERY, {
    query: q,
    first: 50,
  });

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

/**
 * GET /api/github/reviews
 * Fetch open PRs where the configured user's review is requested.
 */
router.get("/reviews", async (_req: Request, res: Response) => {
  const cacheKey = "github:reviews";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const config = getConfig();
  const q = `review-requested:${config.githubUsername} type:pr state:open updated:>=${monthsAgo()}`;

  const result = await graphql<{ search: { nodes: any[] } }>(SEARCH_PRS_QUERY, {
    query: q,
    first: 50,
  });

  const reviews = (result.search.nodes || [])
    .map(mapGraphQLPr)
    .filter((pr: any) => pr.state === "open")
    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const responseData = { reviews };
  apiCache.set(cacheKey, responseData);
  res.json(responseData);
});

/**
 * Extract the issue/PR number from a GitHub API subject URL.
 * e.g. "https://api.github.com/repos/owner/repo/pulls/123" -> 123
 */
function extractSubjectNumber(url: string | undefined): number | null {
  if (!url) return null;
  const match = url.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Convert a GitHub API subject URL to a browser-facing HTML URL.
 * e.g. "https://api.github.com/repos/owner/repo/pulls/123"
 *   -> "https://github.com/owner/repo/pull/123"
 */
function subjectUrlToHtml(apiUrl: string | undefined, repoFullName: string): string {
  if (!apiUrl) return `https://github.com/${repoFullName}`;
  // /repos/owner/repo/pulls/123 -> /owner/repo/pull/123
  // /repos/owner/repo/issues/456 -> /owner/repo/issues/456
  const match = apiUrl.match(/repos\/(.+)\/(pulls|issues)\/(\d+)$/);
  if (!match) return `https://github.com/${repoFullName}`;
  const [, ownerRepo, type, number] = match;
  const htmlType = type === "pulls" ? "pull" : "issues";
  return `https://github.com/${ownerRepo}/${htmlType}/${number}`;
}

/** Bot usernames to filter out from mention notifications. */
const IGNORED_BOTS = [
  "github-actions",
  "datadog-official",
  "copilot",
  "dependabot",
  "renovate",
  "codecov",
  "sonarcloud",
  "netlify",
  "vercel",
];

const ALLOWED_REASONS = new Set([
  "approval_requested",
  "assign",
  "mention",
  "review_requested",
  "team_mention",
]);

/**
 * Fetch all pages of notifications from the GitHub REST API,
 * filtered to only relevant participation reasons.
 */
async function fetchAllNotifications(
  github: ReturnType<typeof createGitHubClient>,
  since: string,
): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await github.get("/notifications", {
      params: { participating: true, all: true, per_page: perPage, since, page },
    });
    for (const n of data) {
      if (ALLOWED_REASONS.has(n.reason)) all.push(n);
    }
    if (data.length < perPage) break;
    page++;
  }

  return all;
}

/**
 * Fetch notification comments with controlled concurrency.
 * Processes in batches to avoid overwhelming the API.
 */
async function fetchCommentsInBatches(
  notifications: any[],
  github: ReturnType<typeof createGitHubClient>,
  batchSize: number = 10,
): Promise<any[]> {
  const results: any[] = [];

  for (let i = 0; i < notifications.length; i += batchSize) {
    const batch = notifications.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (notification: any) => {
        const commentUrl = notification.subject?.latest_comment_url;
        try {
          if (commentUrl) {
            const { data: comment } = await github.get(commentUrl);
            return {
              id: comment.id,
              html_url: comment.html_url,
              body: comment.body || "",
              created_at: comment.created_at,
              updated_at: comment.updated_at,
              user: {
                login: comment.user?.login || "",
                avatar_url: comment.user?.avatar_url || "",
              },
              issue_url: comment.issue_url || "",
              pr_number: extractSubjectNumber(notification.subject?.url),
              repo_full_name: notification.repository?.full_name || "",
              context_title: notification.subject?.title || "",
              reason: notification.reason || "",
            };
          }
          // No comment URL — use notification-level info
          return {
            id: notification.id,
            html_url: subjectUrlToHtml(
              notification.subject?.url,
              notification.repository?.full_name || "",
            ),
            body: "",
            created_at: notification.updated_at,
            updated_at: notification.updated_at,
            user: { login: "", avatar_url: "" },
            issue_url: "",
            pr_number: extractSubjectNumber(notification.subject?.url),
            repo_full_name: notification.repository?.full_name || "",
            context_title: notification.subject?.title || "",
            reason: notification.reason || "",
          };
        } catch {
          return null;
        }
      }),
    );
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

/**
 * Check if a username looks like a bot account.
 */
function isBot(login: string): boolean {
  if (!login) return true;
  const lower = login.toLowerCase();
  if (IGNORED_BOTS.some((bot) => lower.includes(bot))) return true;
  // GitHub bot accounts typically end with [bot]
  if (lower.endsWith("[bot]")) return true;
  return false;
}

/**
 * Extract comments from GraphQL PR nodes (issue comments + review thread comments).
 * Returns flattened GitHubComment-shaped objects for the user's own open PRs,
 * excluding the user's own comments and bot comments.
 */
function extractOwnPRComments(prNodes: any[], username: string): any[] {
  const comments: any[] = [];

  for (const pr of prNodes) {
    if (pr.state?.toLowerCase() !== "open") continue;
    const repoFullName = pr.repository?.nameWithOwner || "";

    // Issue-level comments (general PR comments)
    for (const c of pr.comments?.nodes || []) {
      const login = c.author?.login || "";
      if (login === username) continue;
      if (isBot(login)) continue;
      comments.push({
        id: c.databaseId,
        html_url: c.url,
        body: c.body || "",
        created_at: c.createdAt,
        updated_at: c.updatedAt,
        user: { login, avatar_url: c.author?.avatarUrl || "" },
        issue_url: "",
        pr_number: pr.number,
        repo_full_name: repoFullName,
        context_title: pr.title || "",
        reason: "comment",
      });
    }

    // Review thread comments (inline code comments)
    for (const thread of pr.reviewThreads?.nodes || []) {
      for (const c of thread.comments?.nodes || []) {
        const login = c.author?.login || "";
        if (login === username) continue;
        if (isBot(login)) continue;
        comments.push({
          id: c.databaseId,
          html_url: c.url,
          body: c.body || "",
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          user: { login, avatar_url: c.author?.avatarUrl || "" },
          issue_url: "",
          pr_number: pr.number,
          repo_full_name: repoFullName,
          context_title: pr.title || "",
          reason: "comment",
        });
      }
    }
  }

  return comments;
}

/**
 * GET /api/github/mentions
 * Fetch GitHub mentions from the notifications API (participating, all, 2-month window).
 * Note: comments on the user's own PRs are returned by GET /api/github/prs as pr_comments
 * and merged on the frontend, avoiding a duplicate GraphQL call.
 */
router.get("/mentions", async (_req: Request, res: Response) => {
  const github = createGitHubClient();
  const since = `${monthsAgo(Math.ceil(ACTIVITY_LOOKBACK_DAYS / 30))}T00:00:00Z`;

  const allNotifications = await fetchAllNotifications(github, since);
  const mentions = await fetchCommentsInBatches(allNotifications, github);

  const seen = new Set<number | string>();
  const deduplicated = mentions.filter((m) => {
    if (!m.user?.login) return false;
    if (isBot(m.user.login)) return false;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  deduplicated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  res.json({ mentions: deduplicated });
});

/**
 * Fetch all PRs within a date range, handling the 1000-result limit by recursively narrowing.
 * If a query returns 1000 results, use the oldest PR's creation date to split the range.
 */
/** Fetch PRs for a single sub-range, narrowing dates if hitting GitHub's 1000-result cap. */
async function fetchPRsForSubRange(username: string, startDate: string, endDate: string): Promise<any[]> {
  const MAX_RESULTS = 1000;
  const allPrs: any[] = [];
  let currentStart = startDate;
  let currentEnd = endDate;

  while (true) {
    const q = `author:${username} type:pr created:${currentStart}..${currentEnd}`;
    const rangeNodes: any[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await graphql<{
        search: { nodes: any[]; pageInfo: { hasNextPage: boolean; endCursor: string } };
      }>(SEARCH_MY_PRS_QUERY, { query: q, first: 100, after: cursor });

      rangeNodes.push(...(result.search?.nodes || []));
      hasNextPage = result.search?.pageInfo?.hasNextPage ?? false;
      cursor = result.search?.pageInfo?.endCursor ?? null;
    }

    allPrs.push(...rangeNodes);
    if (rangeNodes.length < MAX_RESULTS) break;

    const oldestDate = rangeNodes[rangeNodes.length - 1].createdAt?.split("T")[0];
    if (!oldestDate || oldestDate === currentStart) break;

    const prevDay = new Date(oldestDate);
    prevDay.setDate(prevDay.getDate() - 1);
    currentEnd = prevDay.toISOString().split("T")[0];
  }

  return allPrs;
}

/** Split date range into N equal chunks, fetch PRs in parallel, dedupe. */
async function fetchAllPRsByDateRange(username: string, startDate: string, endDate: string): Promise<any[]> {
  const PR_PARALLEL_CHUNKS = 4;
  const subRanges = buildEqualRanges(startDate, endDate, PR_PARALLEL_CHUNKS);

  if (subRanges.length <= 1) {
    return fetchPRsForSubRange(username, startDate, endDate);
  }

  const results = await Promise.all(
    subRanges.map((r) => fetchPRsForSubRange(username, r.start, r.end)),
  );

  const seen = new Set<string>();
  const allPrs: any[] = [];
  for (const prs of results) {
    for (const pr of prs) {
      const id = pr.id || pr.url;
      if (!seen.has(id)) {
        seen.add(id);
        allPrs.push(pr);
      }
    }
  }
  return allPrs;
}

/** GET /api/github/prs-by-date-range */
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

  const allNodes = await fetchAllPRsByDateRange(config.githubUsername, startDate, endDate);
  const prs = allNodes.map(mapGraphQLPr);

  logger.info("PRs", `${prs.length} PRs for ${startDate}..${endDate}`);

  const responseData = { prs };
  apiCache.set(cacheKey, responseData);
  res.json(responseData);
});

/** Split a date range into N roughly equal chunks (YYYY-MM-DD strings). */
function buildEqualRanges(startDate: string, endDate: string, chunks: number): { start: string; end: string }[] {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T23:59:59Z`).getTime();
  const totalDays = Math.ceil((end - start) / (24 * 60 * 60 * 1000));

  if (totalDays <= 1 || chunks <= 1) {
    return [{ start: startDate, end: endDate }];
  }

  const n = Math.min(chunks, totalDays);
  const daysPerChunk = Math.ceil(totalDays / n);
  const ranges: { start: string; end: string }[] = [];

  let cur = new Date(`${startDate}T00:00:00Z`);
  const rangeEnd = new Date(`${endDate}T00:00:00Z`);

  for (let i = 0; i < n && cur <= rangeEnd; i++) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + daysPerChunk - 1);
    const actualEnd = chunkEnd > rangeEnd ? rangeEnd : chunkEnd;

    ranges.push({
      start: cur.toISOString().split("T")[0],
      end: actualEnd.toISOString().split("T")[0],
    });

    const next = new Date(actualEnd);
    next.setDate(next.getDate() + 1);
    cur = next;
  }

  return ranges;
}

/** Split a date range into yearly sub-ranges (YYYY-MM-DD strings). */
function buildYearRanges(startDate: string, endDate: string): { start: string; end: string }[] {
  const ranges: { start: string; end: string }[] = [];
  let cur = new Date(`${startDate}T00:00:00Z`);
  const rangeEnd = new Date(`${endDate}T23:59:59Z`);

  while (cur < rangeEnd) {
    const yearEnd = new Date(cur);
    yearEnd.setFullYear(yearEnd.getFullYear() + 1);
    yearEnd.setDate(yearEnd.getDate() - 1);
    const actualEnd = yearEnd > rangeEnd ? rangeEnd : yearEnd;

    ranges.push({
      start: cur.toISOString().split("T")[0],
      end: actualEnd.toISOString().split("T")[0],
    });

    const next = new Date(actualEnd);
    next.setDate(next.getDate() + 1);
    cur = next;
  }

  return ranges;
}

/** Build yearly chunks with ISO timestamps and aliases for contributionsCollection. */
function buildYearChunks(startDate: string, endDate: string) {
  return buildYearRanges(startDate, endDate).map((r, i) => ({
    from: `${r.start}T00:00:00Z`,
    to: `${r.end}T23:59:59Z`,
    alias: `c${i}`,
  }));
}

/** Fetch all user repos with parallel pagination (cached). */
async function fetchUserRepos(github: ReturnType<typeof createGitHubClient>): Promise<any[]> {
  const cacheKey = `github:user-repos`;
  const cached = apiCache.get<any[]>(cacheKey);
  if (cached) return cached;

  const repoParams = { per_page: 100, visibility: "all", affiliation: "owner,collaborator,organization_member" };
  const { data: firstPage } = await github.get("/user/repos", { params: { ...repoParams, page: 1 } });

  if (firstPage.length < 100) {
    apiCache.set(cacheKey, firstPage);
    return firstPage;
  }

  const pages = [firstPage];
  let page = 2;

  // Speculatively fetch pages 2-4 in parallel
  const requests = [2, 3, 4].map((p) => github.get("/user/repos", { params: { ...repoParams, page: p } }));
  const results = await Promise.all(requests);
  for (const result of results) {
    pages.push(result.data);
    if (result.data.length < 100) break;
    page++;
  }

  // Continue sequentially if still more pages
  while (pages[pages.length - 1].length === 100) {
    page++;
    const { data } = await github.get("/user/repos", { params: { ...repoParams, page } });
    pages.push(data);
    if (data.length < 100) break;
  }

  const all = pages.flat();
  apiCache.set(cacheKey, all);
  return all;
}

/** Fetch user's GraphQL node ID (cached). */
async function fetchUserNodeId(
  github: ReturnType<typeof createGitHubClient>,
  username: string,
): Promise<string> {
  const cacheKey = `github:user-node-id:${username}`;
  const cached = apiCache.get<string>(cacheKey);
  if (cached) return cached;

  const { data: user } = await github.get(`/users/${username}`);
  apiCache.set(cacheKey, user.node_id);
  return user.node_id;
}

/** GET /api/github/commits-search — contributionsCollection + fork history. */
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
    const since = `${startDate}T00:00:00Z`;
    const until = `${endDate}T23:59:59Z`;
    const chunks = buildYearChunks(startDate, endDate);

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
      graphql<{ viewer: Record<string, any> }>(contribQuery),
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

    const forkRepos = repos.filter((r: any) =>
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
          const forkData = await graphql(forkQuery);
          for (let idx = 0; idx < batch.length; idx++) {
            const count = forkData[`f${idx}`]?.defaultBranchRef?.target?.history?.totalCount || 0;
            if (count > 0) {
              logger.info("Commits", `fork ${batch[idx].full_name}: ${count}`);
              repoTotals.set(batch[idx].full_name, (repoTotals.get(batch[idx].full_name) || 0) + count);
            }
            forkCount += count;
          }
          break;
        } catch (err: any) {
          if (attempt < MAX_RETRIES) {
            logger.warn("Commits", `Fork batch retry ${attempt + 1}: ${err.message}`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          } else {
            logger.error("Commits", `Fork batch DROPPED: ${batch.map((r: any) => r.full_name).join(", ")}`);
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

    logger.info("Commits", `Total: ${totalCount} (contributions: ${contribCount}, forks: ${forkCount})`);
    const responseData = { commitCount: totalCount };
    apiCache.set(cacheKey, responseData);
    res.json(responseData);
  } catch (err: any) {
    logger.error("Commits", err.message);
    res.status(500).json({ error: "Failed to search commits", commitCount: 0 });
  }
});

router.get("/peer-activity", async (req: Request, res: Response) => {
  const cacheKey = "github:peer-activity";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const config = getConfig();
    const username = config.githubUsername;

    // Fetch PRs authored by user AND PRs user is involved with (reviewed/commented)
    const [myPRsResult, involvedPRsResult] = await Promise.all([
      graphql<{ search: { nodes: any[] } }>(SEARCH_MY_PRS_QUERY, {
        query: `author:${username} type:pr updated:>=${monthsAgo(Math.ceil(ACTIVITY_LOOKBACK_DAYS / 30))}`,
        first: 100,
      }),
      graphql<{ search: { nodes: any[] } }>(SEARCH_MY_PRS_QUERY, {
        query: `involves:${username} -author:${username} type:pr updated:>=${monthsAgo(Math.ceil(ACTIVITY_LOOKBACK_DAYS / 30))}`,
        first: 100,
      }),
    ]);

    const myPRNodes = myPRsResult.search.nodes || [];
    const involvedPRNodes = involvedPRsResult.search.nodes || [];
    logger.info("PeerActivity", `myPRs: ${myPRNodes.length}, involvedPRs: ${involvedPRNodes.length}`);

    // Deduplicate by URL
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

      // Extract peer reviews (only approval/changes_requested, skip generic "reviewed" — always paired with comment)
      for (const review of pr.reviews?.nodes || []) {
        const login = review.author?.login;
        if (!login || login === username || isBot(login)) continue;
        if (review.state !== "APPROVED" && review.state !== "CHANGES_REQUESTED") continue;

        const action = review.state === "APPROVED" ? "Approved PR" : "Requested changes";

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
          },
        });
      }

      // Extract peer issue-level comments
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

      // Extract peer review thread comments (inline code comments)
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

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    logger.info("PeerActivity", `found ${activities.length} peer activities from ${allPRNodes.length} PRs`);

    const result = { activities };
    apiCache.set(cacheKey, result);
    res.json(result);
  } catch (err: any) {
    logger.error("PeerActivity", err.message);
    res.status(500).json({ error: "Failed to fetch peer activity" });
  }
});

export default router;
