import { Router, Request, Response } from "express";
import { getConfig, isGithubConfigured, isJiraConfigured } from "../config";
import { createJiraClient } from "../clients/jiraApiClient";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import { apiCache } from "../utils/cache";
import { logError } from "../utils/errors";
import { logger } from "../utils/logger";
import {
  ACTIVITY_LOOKBACK_DAYS,
  ACTIVITY_LIVE_DAYS,
  COMMENT_PREVIEW_LENGTH,
  SHORT_CACHE_TTL,
} from "../utils/constants";
import { getCachedActivities, saveActivities, purgeOldActivities } from "../services/activityCache";
import { adfToPlainText } from "../utils/adf";

const router = Router();

async function fetchAllCommits(
  github: ReturnType<typeof createGitHubClient>,
  repo: string,
  params: Record<string, string>,
): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const { data } = await github.get(`/repos/${repo}/commits`, {
      params: { ...params, per_page: 100, page },
    });
    all.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return all;
}

interface ActivityItem {
  id: string;
  type: "jira" | "github";
  action: string;
  title: string;
  url: string;
  timestamp: string;
  entityKey: string;
  metadata?: Record<string, any>;
}

/**
 * GET /api/activity
 * Fetch recent activity from JIRA and GitHub (last 48 hours)
 */
let refreshInProgress = false;
const ACTIVITY_CACHE_KEY = "activity:recent";

async function refreshActivityCache(): Promise<{ activities: ActivityItem[] }> {
  const [jiraActivities, githubActivities] = await Promise.all([
    fetchJiraActivity(ACTIVITY_LIVE_DAYS),
    fetchGitHubActivity(ACTIVITY_LIVE_DAYS),
  ]);

  const liveActivities = [...jiraActivities, ...githubActivities];
  logger.info(
    "Activity",
    `Live fetch (${ACTIVITY_LIVE_DAYS}d): ${jiraActivities.length} JIRA, ${githubActivities.length} GitHub`,
  );

  // Save live activities to SQLite
  saveActivities(liveActivities);

  // Read cached activities for the older window (LIVE_DAYS .. LOOKBACK_DAYS)
  const now = Date.now();
  const liveCutoff = new Date(now - ACTIVITY_LIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const lookbackCutoff = new Date(now - ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const cachedActivities = getCachedActivities(lookbackCutoff, liveCutoff);
  logger.info(
    "Activity",
    `SQLite cache: ${cachedActivities.length} activities (days ${ACTIVITY_LIVE_DAYS}-${ACTIVITY_LOOKBACK_DAYS})`,
  );

  // Merge: live wins on id conflict
  const byId = new Map<string, ActivityItem>();
  for (const item of cachedActivities) byId.set(item.id, item);
  for (const item of liveActivities) byId.set(item.id, item);

  const allActivities = Array.from(byId.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  logger.info("Activity", `Total: ${allActivities.length} activities`);

  const result = { activities: allActivities };
  apiCache.set(ACTIVITY_CACHE_KEY, result, SHORT_CACHE_TTL);
  return result;
}

export async function prefetchActivity(): Promise<void> {
  logger.info("Activity/Prefetch", "Starting full 30-day activity fetch");
  const [jiraActivities, githubActivities] = await Promise.all([
    fetchJiraActivity(ACTIVITY_LOOKBACK_DAYS),
    fetchGitHubActivity(ACTIVITY_LOOKBACK_DAYS),
  ]);

  const allActivities = [...jiraActivities, ...githubActivities];
  logger.info(
    "Activity/Prefetch",
    `Fetched ${jiraActivities.length} JIRA, ${githubActivities.length} GitHub = ${allActivities.length} total`,
  );

  saveActivities(allActivities);

  const cutoff = new Date(Date.now() - ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const purged = purgeOldActivities(cutoff);
  if (purged > 0)
    logger.info(
      "Activity/Prefetch",
      `Purged ${purged} activities older than ${ACTIVITY_LOOKBACK_DAYS} days`,
    );

  const sorted = allActivities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  apiCache.set(ACTIVITY_CACHE_KEY, { activities: sorted }, SHORT_CACHE_TTL);
  logger.info("Activity/Prefetch", "Done, apiCache warmed");
}

router.get("/", async (_req: Request, res: Response) => {
  const stale = apiCache.getStale<{ activities: ActivityItem[] }>(ACTIVITY_CACHE_KEY);
  if (stale) {
    if (stale.fresh) return res.json(stale.data);

    res.json(stale.data);
    if (!refreshInProgress) {
      refreshInProgress = true;
      refreshActivityCache()
        .catch((err) => logError("Activity/background-refresh", err))
        .finally(() => {
          refreshInProgress = false;
        });
    }
    return;
  }

  const result = await refreshActivityCache();
  res.json(result);
});

function activityCounts(activities: ActivityItem[]) {
  return {
    github: activities.filter((a) => a.type === "github").length,
    jira: activities.filter((a) => a.type === "jira").length,
    total: activities.length,
  };
}

router.get("/count", async (_req: Request, res: Response) => {
  const stale = apiCache.getStale<{ activities: ActivityItem[] }>(ACTIVITY_CACHE_KEY);
  if (stale) {
    res.json(activityCounts(stale.data.activities));
    if (!stale.fresh && !refreshInProgress) {
      refreshInProgress = true;
      refreshActivityCache()
        .catch((err) => logError("Activity/background-refresh", err))
        .finally(() => {
          refreshInProgress = false;
        });
    }
    return;
  }

  const result = await refreshActivityCache();
  res.json(activityCounts(result.activities));
});

function truncatePreview(text: string): string {
  const trimmed = text.slice(0, COMMENT_PREVIEW_LENGTH);
  return trimmed + (text.length > COMMENT_PREVIEW_LENGTH ? "..." : "");
}

async function fetchJiraCreated(
  jira: any,
  config: any,
  lookbackDays: number,
): Promise<ActivityItem[]> {
  const { data } = await jira.post("/search/jql", {
    jql: `creator = currentUser() AND created >= -${lookbackDays}d ORDER BY created DESC`,
    fields: ["summary", "created"],
    maxResults: 20,
  });

  return (data.issues || []).map((issue: any) => ({
    id: `jira-created-${issue.key}`,
    type: "jira" as const,
    action: "Created ticket",
    title: `${issue.key}: ${issue.fields.summary}`,
    url: `${config.jiraBaseUrl}/browse/${issue.key}`,
    timestamp: issue.fields.created,
    entityKey: issue.key,
  }));
}

async function fetchJiraComments(
  jira: any,
  config: any,
  userAccountId: string,
  cutoffTime: number,
  lookbackDays: number,
): Promise<ActivityItem[]> {
  const { data: commentedIssues } = await jira.post("/search/jql", {
    jql: `comment ~ currentUser() AND updated >= -${lookbackDays}d ORDER BY updated DESC`,
    fields: ["summary"],
    maxResults: 100,
  });

  const issues = commentedIssues.issues || [];
  logger.info("Activity/JIRA", `Fetching comments for ${issues.length} issues`);

  const issueComments = await Promise.all(
    issues.slice(0, 30).map(async (issue: any) => {
      try {
        const { data } = await jira.get(`/issue/${issue.key}/comment`, {
          params: { maxResults: 50, orderBy: "-created" },
        });
        return { issue, comments: data.comments || [] };
      } catch {
        return { issue, comments: [] };
      }
    }),
  );

  const activities: ActivityItem[] = [];
  let commentCount = 0;
  for (const { issue, comments } of issueComments) {
    for (const comment of comments) {
      if (comment.author?.accountId !== userAccountId) continue;
      if (new Date(comment.created).getTime() < cutoffTime) continue;

      const plainText = adfToPlainText(comment.body);
      const commentPreview = plainText ? truncatePreview(plainText) : "";
      activities.push({
        id: `jira-comment-${comment.id}`,
        type: "jira",
        action: "Commented on ticket",
        title: `${issue.key}: ${issue.fields.summary}`,
        url: `${config.jiraBaseUrl}/browse/${issue.key}?focusedCommentId=${comment.id}`,
        timestamp: comment.created,
        entityKey: issue.key,
        metadata: { commentBody: commentPreview || undefined },
      });
      commentCount++;
    }
  }
  logger.info("Activity/JIRA", `Comments: ${commentCount} from ${issues.length} issues`);
  return activities;
}

async function fetchJiraTransitions(
  jira: any,
  config: any,
  userAccountId: string,
  cutoffTime: number,
  lookbackDays: number,
): Promise<ActivityItem[]> {
  const { data: transitionIssues } = await jira.post("/search/jql", {
    jql: `assignee was currentUser() AND status changed AFTER -${lookbackDays}d ORDER BY updated DESC`,
    fields: ["summary"],
    maxResults: 50,
  });

  const issueKeys = (transitionIssues.issues || []).map((i: any) => i.key);
  const summaryMap = new Map<string, string>();
  for (const issue of transitionIssues.issues || []) {
    summaryMap.set(issue.key, issue.fields?.summary || "");
  }

  const changelogs = await Promise.all(
    issueKeys.slice(0, 20).map(async (key: string) => {
      try {
        const { data } = await jira.get(`/issue/${key}/changelog`, { params: { maxResults: 50 } });
        return { key, histories: data.values || [] };
      } catch {
        return { key, histories: [] };
      }
    }),
  );

  const activities: ActivityItem[] = [];
  for (const { key, histories } of changelogs) {
    for (const history of histories) {
      if (history.author?.accountId !== userAccountId) continue;
      if (new Date(history.created).getTime() < cutoffTime) continue;

      for (const item of history.items || []) {
        if (item.field !== "status") continue;
        activities.push({
          id: `jira-transition-${key}-${history.id}`,
          type: "jira",
          action: "Changed status",
          title: `${key}: ${summaryMap.get(key) || ""}`,
          url: `${config.jiraBaseUrl}/browse/${key}`,
          timestamp: history.created,
          entityKey: key,
          metadata: {
            fromStatus: item.fromString,
            toStatus: item.toString,
            commentBody: `${item.fromString} → ${item.toString}`,
          },
        });
      }
    }
  }
  logger.info(
    "Activity/JIRA",
    `Transitions checked: ${issueKeys.length} issues, ${changelogs.reduce((s, c) => s + c.histories.length, 0)} changelog entries`,
  );
  return activities;
}

async function fetchJiraActivity(
  lookbackDays: number = ACTIVITY_LOOKBACK_DAYS,
): Promise<ActivityItem[]> {
  if (!isJiraConfigured()) return [];
  const config = getConfig();
  const jira = createJiraClient();

  let userAccountId: string;
  try {
    const { data: userData } = await jira.get("/myself");
    userAccountId = userData.accountId;
  } catch (err) {
    logError("Activity/JIRA /myself", err);
    return [];
  }

  const cutoffTime = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  const [created, comments, transitions] = await Promise.all([
    fetchJiraCreated(jira, config, lookbackDays).catch((err) => {
      logError("Activity/JIRA created", err);
      return [] as ActivityItem[];
    }),
    fetchJiraComments(jira, config, userAccountId, cutoffTime, lookbackDays).catch((err) => {
      logError("Activity/JIRA comments", err);
      return [] as ActivityItem[];
    }),
    fetchJiraTransitions(jira, config, userAccountId, cutoffTime, lookbackDays).catch((err) => {
      logError("Activity/JIRA transitions", err);
      return [] as ActivityItem[];
    }),
  ]);

  return [...created, ...comments, ...transitions];
}

async function fetchGitHubActivity(
  lookbackDays: number = ACTIVITY_LOOKBACK_DAYS,
): Promise<ActivityItem[]> {
  if (!isGithubConfigured()) return [];
  const config = getConfig();
  const github = createGitHubClient();
  const activities: ActivityItem[] = [];
  const thirtyDaysAgo = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const since = new Date(thirtyDaysAgo).toISOString();
  const seenShas = new Set<string>();
  const pushBranches = new Map<string, Set<string>>();

  // Fetch user avatar once, reuse across event + GraphQL sections
  let userActor = { login: config.githubUsername, avatar_url: "" };
  try {
    const { data: userProfile } = await github.get(`/users/${config.githubUsername}`);
    userActor = { login: config.githubUsername, avatar_url: userProfile.avatar_url };
  } catch (err) {
    logError("Activity/GitHub user profile", err);
  }

  const sinceDate = new Date(thirtyDaysAgo).toISOString().slice(0, 10);
  const untilDate = new Date().toISOString().slice(0, 10);

  const PR_ACTIVITY_QUERY = `
    query($query: String!, $first: Int!) {
      search(query: $query, type: ISSUE, first: $first) {
        nodes {
          ... on PullRequest {
            number
            title
            url
            merged
            createdAt
            mergedAt
            mergedBy { login avatarUrl }
            repository { nameWithOwner }
          }
        }
      }
    }
  `;

  const repoDiscoveryPromise = graphql<{
    viewer: {
      contributionsCollection: {
        commitContributionsByRepository: {
          repository: { nameWithOwner: string; defaultBranchRef: { name: string } | null };
        }[];
      };
    };
  }>(
    `query {
      viewer {
        contributionsCollection(from: "${sinceDate}T00:00:00Z", to: "${untilDate}T23:59:59Z") {
          commitContributionsByRepository(maxRepositories: 100) {
            repository { nameWithOwner defaultBranchRef { name } }
          }
        }
      }
    }`,
    {},
    "activity/repo-discovery",
  ).catch((err) => {
    logError("Activity/GitHub repo discovery", err);
    return null;
  });

  const prSupplementPromise = graphql<{ search: { nodes: any[] } }>(
    PR_ACTIVITY_QUERY,
    {
      query: `author:${config.githubUsername} type:pr created:>=${sinceDate}`,
      first: 100,
    },
    "activity/pr-supplement",
  ).catch((err) => {
    logError("Activity/GitHub GraphQL PRs", err);
    return null;
  });

  const mergedPrsPromise = graphql<{ search: { nodes: any[] } }>(
    PR_ACTIVITY_QUERY,
    {
      query: `involves:${config.githubUsername} type:pr is:merged merged:>=${sinceDate}`,
      first: 100,
    },
    "activity/merged-prs",
  ).catch((err) => {
    logError("Activity/GitHub merged PRs", err);
    return null;
  });

  try {
    const events: any[] = [];
    let page = 1;
    while (true) {
      const { data } = await github.get(`/users/${config.githubUsername}/events`, {
        params: { per_page: 100, page },
      });
      events.push(...data);
      if (data.length < 100) break;
      page++;
    }

    logger.info("Activity", `GitHub events: ${events.length} raw`);

    // Filter to last 24h events first
    const recentEvents = events.filter(
      (e: any) => new Date(e.created_at).getTime() >= thirtyDaysAgo,
    );

    // Collect unique PR references that need title lookup (events API returns abbreviated PR objects without title)
    const prRefs = new Map<string, { owner: string; repo: string; number: number }>();
    // Collect review IDs that need comment body lookup (Events API omits review comment bodies)
    const reviewRefs: { repo: string; prNumber: number; reviewId: number; eventId: string }[] = [];
    for (const event of recentEvents) {
      const repo = event.repo?.name || "";
      const [owner, repoName] = repo.split("/");
      const pr = event.payload?.pull_request;
      if (pr && !pr.title && owner && repoName) {
        const key = `${repo}#${pr.number}`;
        if (!prRefs.has(key)) {
          prRefs.set(key, { owner, repo: repoName, number: pr.number });
        }
      }
      if (
        event.type === "PullRequestReviewEvent" &&
        event.payload?.review?.state === "commented" &&
        !event.payload?.review?.body
      ) {
        reviewRefs.push({
          repo,
          prNumber: pr?.number,
          reviewId: event.payload.review.id,
          eventId: event.id,
        });
      }
    }

    // Batch fetch PR titles via GraphQL
    const prTitles = new Map<string, string>();
    if (prRefs.size > 0) {
      try {
        const variables: Record<string, string | number> = {};
        const varDefs: string[] = [];
        const fragments = Array.from(prRefs.entries()).map(([_key, ref], i) => {
          varDefs.push(`$o${i}: String!`, `$r${i}: String!`, `$n${i}: Int!`);
          variables[`o${i}`] = ref.owner;
          variables[`r${i}`] = ref.repo;
          variables[`n${i}`] = ref.number;
          return `pr${i}: repository(owner: $o${i}, name: $r${i}) { pullRequest(number: $n${i}) { title } }`;
        });
        const query = `query(${varDefs.join(", ")}) { ${fragments.join("\n")} }`;
        const data = await graphql(query, variables, "activity/pr-titles");
        Array.from(prRefs.keys()).forEach((key, i) => {
          const title = data[`pr${i}`]?.pullRequest?.title;
          if (title) prTitles.set(key, title);
        });
        logger.info("Activity", `Fetched ${prTitles.size} PR titles via GraphQL`);
      } catch (err) {
        logError("Activity/GitHub PR titles", err, { prCount: prRefs.size });
      }
    }

    // Batch fetch review comment bodies via REST (capped concurrency)
    const reviewBodies = new Map<string, string>();
    const REVIEW_BATCH_SIZE = 5;
    if (reviewRefs.length > 0) {
      for (let i = 0; i < reviewRefs.length; i += REVIEW_BATCH_SIZE) {
        const batch = reviewRefs.slice(i, i + REVIEW_BATCH_SIZE);
        await Promise.all(
          batch.map(async (ref) => {
            try {
              const { data: comments } = await github.get(
                `/repos/${ref.repo}/pulls/${ref.prNumber}/reviews/${ref.reviewId}/comments`,
                { params: { per_page: 1 } },
              );
              if (comments?.[0]?.body) {
                reviewBodies.set(ref.eventId, comments[0].body);
              }
            } catch {
              // Non-critical, skip silently
            }
          }),
        );
      }
      logger.info(
        "Activity",
        `Fetched ${reviewBodies.size}/${reviewRefs.length} review comment bodies`,
      );
    }

    // Helper to resolve PR title
    const getPRTitle = (repo: string, pr: any): string => {
      if (pr.title) return pr.title;
      return prTitles.get(`${repo}#${pr.number}`) || `PR #${pr.number}`;
    };

    for (const event of recentEvents) {
      const repo = event.repo?.name || "";

      switch (event.type) {
        case "PushEvent":
          // Skip - commits fetched separately via REST API below
          break;
        case "PullRequestEvent": {
          const pr = event.payload?.pull_request;
          const prAction = event.payload?.action;
          if (!pr) break;

          let action = "";
          if (prAction === "opened") action = "Created PR";
          else if (prAction === "closed" && !pr.merged) action = "Closed PR";
          // Merged PRs handled by GraphQL queries below
          if (!action) break;

          activities.push({
            id: `github-pr-${event.id}`,
            type: "github",
            action,
            title: `${repo}#${pr.number}: ${getPRTitle(repo, pr)}`,
            url: pr.html_url || `https://github.com/${repo}/pull/${pr.number}`,
            timestamp: event.created_at,
            entityKey: `${repo}#${pr.number}`,
            metadata: { actor: userActor },
          });
          break;
        }
        case "PullRequestReviewEvent": {
          const review = event.payload?.review;
          const pr = event.payload?.pull_request;
          if (!pr) break;

          const reviewState = review?.state;
          let reviewAction = "";
          if (reviewState === "approved") reviewAction = "Approved PR";
          else if (reviewState === "changes_requested") reviewAction = "Changes Requested";
          else if (reviewState === "commented") reviewAction = "Commented on PR";
          if (!reviewAction) break;

          const entityKey = `${repo}#${pr.number}`;
          const reviewBody = review?.body || reviewBodies.get(event.id) || "";
          const reviewTrimmed = reviewBody.slice(0, COMMENT_PREVIEW_LENGTH);
          const reviewPreview =
            reviewTrimmed + (reviewBody.length > COMMENT_PREVIEW_LENGTH ? "..." : "");
          activities.push({
            id: `github-review-${event.id}`,
            type: "github",
            action: reviewAction,
            title: `${entityKey}: ${getPRTitle(repo, pr)}`,
            url: review?.html_url || pr.html_url || `https://github.com/${repo}/pull/${pr.number}`,
            timestamp: event.created_at,
            entityKey,
            metadata: {
              state: reviewState,
              actor: userActor,
              ...(reviewPreview && { commentBody: reviewPreview }),
            },
          });
          break;
        }
        case "IssueCommentEvent": {
          const comment = event.payload?.comment;
          const issue = event.payload?.issue;
          if (!issue) break;

          const isPR = !!issue.pull_request;
          const body = comment?.body || "";
          const trimmed = body.slice(0, COMMENT_PREVIEW_LENGTH);
          const commentPreview = trimmed + (body.length > COMMENT_PREVIEW_LENGTH ? "..." : "");
          activities.push({
            id: `github-comment-${event.id}`,
            type: "github",
            action: `Commented on ${isPR ? "PR" : "issue"}`,
            title: `${repo}#${issue.number}: ${issue.title}`,
            url: comment?.html_url || issue.html_url,
            timestamp: event.created_at,
            entityKey: `${repo}#${issue.number}`,
            metadata: { actor: userActor, commentBody: commentPreview },
          });
          break;
        }
        case "PullRequestReviewCommentEvent": {
          const comment = event.payload?.comment;
          const pr = event.payload?.pull_request;
          if (!pr) break;

          const body = comment?.body || "";
          const trimmed = body.slice(0, COMMENT_PREVIEW_LENGTH);
          const commentPreview = trimmed + (body.length > COMMENT_PREVIEW_LENGTH ? "..." : "");
          activities.push({
            id: `github-comment-${event.id}`,
            type: "github",
            action: "Commented on PR",
            title: `${repo}#${pr.number}: ${getPRTitle(repo, pr)}`,
            url: comment?.html_url || `https://github.com/${repo}/pull/${pr.number}`,
            timestamp: event.created_at,
            entityKey: `${repo}#${pr.number}`,
            metadata: { actor: userActor, commentBody: commentPreview },
          });
          break;
        }
        case "IssuesEvent": {
          const issue = event.payload?.issue;
          if (!issue || event.payload?.action !== "opened") break;

          activities.push({
            id: `github-issue-${event.id}`,
            type: "github",
            action: "Created issue",
            title: `${repo}#${issue.number}: ${issue.title}`,
            url: issue.html_url,
            timestamp: event.created_at,
            entityKey: `${repo}#${issue.number}`,
            metadata: { actor: userActor },
          });
          break;
        }
      }
    }
    // Fetch commits separately - events API strips commit data from private repos
    for (const event of recentEvents) {
      if (event.type === "PushEvent" && event.repo?.name) {
        const repo = event.repo.name;
        const branch = (event.payload?.ref || "").replace("refs/heads/", "");
        if (!branch) continue;
        if (!pushBranches.has(repo)) pushBranches.set(repo, new Set());
        pushBranches.get(repo)!.add(branch);
      }
    }

    const COMMIT_BATCH_SIZE = 5;
    const commitTasks: { repo: string; branch: string }[] = [];
    for (const [repo, branches] of pushBranches) {
      for (const branch of branches) {
        commitTasks.push({ repo, branch });
      }
    }
    for (let i = 0; i < commitTasks.length; i += COMMIT_BATCH_SIZE) {
      const batch = commitTasks.slice(i, i + COMMIT_BATCH_SIZE);
      await Promise.all(
        batch.map(({ repo: repoFullName, branch }) =>
          fetchAllCommits(github, repoFullName, {
            sha: branch,
            author: config.githubUsername,
            since,
          })
            .then((commits) => {
              for (const commit of commits) {
                if (seenShas.has(commit.sha)) continue;
                seenShas.add(commit.sha);
                const firstLine = (commit.commit?.message || "").split("\n")[0].slice(0, 120);
                activities.push({
                  id: `github-commit-${commit.sha}`,
                  type: "github",
                  action: "Committed",
                  title: `${repoFullName}: ${firstLine}`,
                  url: commit.html_url,
                  timestamp: commit.commit?.author?.date || commit.commit?.committer?.date,
                  entityKey: `${repoFullName}:${commit.sha}`,
                  metadata: { actor: userActor },
                });
              }
            })
            .catch((err: any) => {
              if (err?.response?.status === 404) {
                logger.warn("Activity", `Repo not found: ${repoFullName}@${branch}`);
              } else {
                logError("Activity/GitHub commits", err, { repo: repoFullName, branch });
              }
            }),
        ),
      );
    }
  } catch (err) {
    logger.error("Activity", "Failed to fetch GitHub events", { error: String(err) });
  }

  const [repoDiscovery, prSupplement, mergedPrs] = await Promise.all([
    repoDiscoveryPromise,
    prSupplementPromise,
    mergedPrsPromise,
  ]);

  if (repoDiscovery) {
    const repos =
      repoDiscovery.viewer.contributionsCollection.commitContributionsByRepository || [];
    let supplementCount = 0;

    const supplementFetches = repos
      .filter((entry) => !pushBranches.has(entry.repository.nameWithOwner))
      .map((entry) => {
        const repoFullName = entry.repository.nameWithOwner;
        const defaultBranch = entry.repository.defaultBranchRef?.name || "main";
        return fetchAllCommits(github, repoFullName, {
          sha: defaultBranch,
          author: config.githubUsername,
          since,
        })
          .then((commits) => {
            for (const commit of commits) {
              if (seenShas.has(commit.sha)) continue;
              seenShas.add(commit.sha);
              const firstLine = (commit.commit?.message || "").split("\n")[0].slice(0, 120);
              activities.push({
                id: `github-commit-${commit.sha}`,
                type: "github",
                action: "Committed",
                title: `${repoFullName}: ${firstLine}`,
                url: commit.html_url,
                timestamp: commit.commit?.author?.date || commit.commit?.committer?.date,
                entityKey: `${repoFullName}:${commit.sha}`,
                metadata: { actor: userActor },
              });
              supplementCount++;
            }
          })
          .catch((err: any) => {
            if (err?.response?.status === 404) {
              logger.warn("Activity", `Repo not found: ${repoFullName}@${defaultBranch}`);
            } else {
              logError("Activity/GitHub commit supplement", err, { repo: repoFullName });
            }
          });
      });
    await Promise.all(supplementFetches);
    logger.info(
      "Activity",
      `GraphQL repo discovery: ${repos.length} repos, ${supplementCount} extra commits`,
    );
  }

  const seenEntityKeys = new Set(
    activities.filter((a) => a.action.includes("PR")).map((a) => a.entityKey),
  );

  if (prSupplement) {
    for (const pr of prSupplement.search.nodes || []) {
      const repoName = pr.repository?.nameWithOwner || "";
      const entityKey = `${repoName}#${pr.number}`;

      if (pr.createdAt && !seenEntityKeys.has(entityKey)) {
        activities.push({
          id: `github-pr-gql-created-${pr.number}`,
          type: "github",
          action: "Created PR",
          title: `${repoName}#${pr.number}: ${pr.title}`,
          url: pr.url,
          timestamp: pr.createdAt,
          entityKey,
          metadata: { actor: userActor },
        });
        seenEntityKeys.add(entityKey);
      }

      if (
        pr.merged &&
        pr.mergedAt &&
        pr.mergedBy?.login === config.githubUsername &&
        !seenEntityKeys.has(`${entityKey}-merged`)
      ) {
        activities.push({
          id: `github-pr-gql-merged-${pr.number}`,
          type: "github",
          action: "Merged PR",
          title: `${repoName}#${pr.number}: ${pr.title}`,
          url: pr.url,
          timestamp: pr.mergedAt,
          entityKey,
          metadata: { actor: userActor },
        });
      }
    }
    logger.info(
      "Activity",
      `GraphQL PR supplement: ${prSupplement.search.nodes?.length || 0} PRs checked`,
    );
  }

  if (mergedPrs) {
    let mergedCount = 0;
    for (const pr of mergedPrs.search.nodes || []) {
      if (pr.mergedBy?.login !== config.githubUsername) continue;

      const repoName = pr.repository?.nameWithOwner || "";
      const entityKey = `${repoName}#${pr.number}`;

      if (!seenEntityKeys.has(`${entityKey}-merged`)) {
        activities.push({
          id: `github-pr-gql-merged-by-${pr.number}-${repoName}`,
          type: "github",
          action: "Merged PR",
          title: `${repoName}#${pr.number}: ${pr.title}`,
          url: pr.url,
          timestamp: pr.mergedAt,
          entityKey,
          metadata: { actor: userActor },
        });
        seenEntityKeys.add(`${entityKey}-merged`);
        mergedCount++;
      }
    }
    logger.info(
      "Activity",
      `GraphQL merged PRs: ${mergedPrs.search.nodes?.length || 0} checked, ${mergedCount} by user`,
    );
  }

  logger.info("Activity", `GitHub: ${activities.length} activities`);
  return activities;
}

export default router;
