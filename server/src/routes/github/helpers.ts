import { graphql } from "../../clients/githubGraphqlClient";
import { createGitHubClient } from "../../clients/githubApiClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import { LONG_CACHE_TTL } from "../../utils/constants";
import { SEARCH_PRS_QUERY } from "./queries";

/**
 * Get an ISO date string for months ago (YYYY-MM-DD).
 */
export function monthsAgo(months: number = 1): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * Derive an overall review status from a list of review nodes.
 * Returns "APPROVED", "CHANGES_REQUESTED", "REVIEWED", or null.
 */
export function deriveReviewStatus(reviews: any[] | undefined): string | null {
  if (!reviews || reviews.length === 0) return null;

  const latestByAuthor = new Map<string, string>();
  for (const r of reviews) {
    const login = r.author?.login || "";
    if (!login) continue;
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
export function mapGraphQLPr(node: any) {
  const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup;
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
    repository_url: `https://api.github.com/repos/${node.repository?.nameWithOwner || ""}`,
    repo_full_name: node.repository?.nameWithOwner || "",
    checks_status: rollup?.state || null,
    review_status: deriveReviewStatus(node.reviews?.nodes),
    additions: node.additions || 0,
    deletions: node.deletions || 0,
  };
}

/**
 * Extract the issue/PR number from a GitHub API subject URL.
 */
export function extractSubjectNumber(url: string | undefined): number | null {
  if (!url) return null;
  const match = url.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Convert a GitHub API subject URL to a browser-facing HTML URL.
 */
export function subjectUrlToHtml(apiUrl: string | undefined, repoFullName: string): string {
  if (!apiUrl) return `https://github.com/${repoFullName}`;
  const match = apiUrl.match(/repos\/(.+)\/(pulls|issues)\/(\d+)$/);
  if (!match) return `https://github.com/${repoFullName}`;
  const [, ownerRepo, type, number] = match;
  const htmlType = type === "pulls" ? "pull" : "issues";
  return `https://github.com/${ownerRepo}/${htmlType}/${number}`;
}

export const IGNORED_BOTS = [
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

export const ALLOWED_REASONS = new Set([
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
export async function fetchAllNotifications(
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
 */
export async function fetchCommentsInBatches(
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
export function isBot(login: string): boolean {
  if (!login) return true;
  const lower = login.toLowerCase();
  if (IGNORED_BOTS.some((bot) => lower.includes(bot))) return true;
  if (lower.endsWith("[bot]")) return true;
  return false;
}

/**
 * Extract comments from GraphQL PR nodes (issue comments + review thread comments).
 */
export function extractOwnPRComments(prNodes: any[], username: string): any[] {
  const comments: any[] = [];

  for (const pr of prNodes) {
    if (pr.state?.toLowerCase() !== "open") continue;
    const repoFullName = pr.repository?.nameWithOwner || "";

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
 * Fetch PRs for a single sub-range, narrowing dates if hitting GitHub's 1000-result cap.
 * @param queryPrefix - GitHub search prefix, e.g. "author:user type:pr"
 */
export async function fetchPRsForSubRange(
  queryPrefix: string,
  startDate: string,
  endDate: string,
): Promise<any[]> {
  const MAX_RESULTS = 1000;
  const allPrs: any[] = [];
  let currentStart = startDate;
  let currentEnd = endDate;

  while (true) {
    const q = `${queryPrefix} created:${currentStart}..${currentEnd}`;
    const rangeNodes: any[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      let result;
      try {
        result = await graphql<{
          search: { nodes: any[]; pageInfo: { hasNextPage: boolean; endCursor: string } };
        }>(SEARCH_PRS_QUERY, { query: q, first: 100, after: cursor }, "contributions/page");
      } catch (error) {
        logger.error(
          "fetchPRsForSubRange",
          `Failed to fetch PRs for ${currentStart}..${currentEnd}: ${error}`,
        );
        break;
      }

      if (!result?.search) {
        logger.warn(
          "fetchPRsForSubRange",
          `No search data in response for ${currentStart}..${currentEnd}`,
        );
        break;
      }

      rangeNodes.push(...(result.search.nodes || []));
      hasNextPage = result.search.pageInfo?.hasNextPage ?? false;
      cursor = result.search.pageInfo?.endCursor ?? null;
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

/**
 * Split a date range into yearly sub-ranges (YYYY-MM-DD strings).
 */
export function buildYearRanges(
  startDate: string,
  endDate: string,
): { start: string; end: string }[] {
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

/**
 * Fetch all user repos with parallel pagination (cached).
 */
export async function fetchUserRepos(
  github: ReturnType<typeof createGitHubClient>,
): Promise<any[]> {
  const cacheKey = `github:user-repos`;
  const cached = apiCache.get<any[]>(cacheKey);
  if (cached) return cached;

  const repoParams = {
    per_page: 100,
    visibility: "all",
    affiliation: "owner,collaborator,organization_member",
  };
  const { data: firstPage } = await github.get("/user/repos", {
    params: { ...repoParams, page: 1 },
  });

  if (firstPage.length < 100) {
    apiCache.set(cacheKey, firstPage);
    return firstPage;
  }

  const pages = [firstPage];
  const requests = [2, 3, 4].map((p) =>
    github.get("/user/repos", { params: { ...repoParams, page: p } }),
  );
  const results = await Promise.all(requests);
  for (const result of results) {
    pages.push(result.data);
    if (result.data.length < 100) break;
  }

  let page = 5;
  while (pages[pages.length - 1].length === 100) {
    const { data } = await github.get("/user/repos", { params: { ...repoParams, page } });
    pages.push(data);
    if (data.length < 100) break;
    page++;
  }

  const all = pages.flat();
  apiCache.set(cacheKey, all);
  return all;
}

/**
 * Fetch user's GitHub join date (YYYY-MM-DD, cached 24h).
 */
export async function fetchUserJoinDate(
  github: ReturnType<typeof createGitHubClient>,
  username: string,
): Promise<string | null> {
  const cacheKey = `github:user-join-date:${username}`;
  const cached = apiCache.get<string>(cacheKey);
  if (cached) return cached;

  try {
    const { data: user } = await github.get(`/users/${username}`);
    const joinDate = user.created_at?.slice(0, 10) || null;
    if (joinDate) apiCache.set(cacheKey, joinDate, LONG_CACHE_TTL);
    return joinDate;
  } catch {
    return null;
  }
}

/**
 * Gate a start date to user's join date if earlier.
 */
export async function gateStartDate(
  github: ReturnType<typeof createGitHubClient>,
  username: string,
  startDate: string,
): Promise<string> {
  const joinDate = await fetchUserJoinDate(github, username);
  if (joinDate && joinDate > startDate) {
    logger.info("DateGate", `${startDate} → ${joinDate} (join date)`);
    return joinDate;
  }
  return startDate;
}
