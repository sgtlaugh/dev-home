import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { createJiraClient } from "../clients/jiraApiClient";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import { apiCache } from "../utils/cache";
import { logError } from "../utils/errors";
import { logger } from "../utils/logger";
import { ACTIVITY_LOOKBACK_DAYS, COMMENT_PREVIEW_LENGTH, SHORT_CACHE_TTL } from "../utils/constants";
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
router.get("/", async (_req: Request, res: Response) => {
  const cacheKey = "activity:recent";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const [jiraActivities, githubActivities] = await Promise.all([
    fetchJiraActivity(),
    fetchGitHubActivity(),
  ]);

  const allActivities = [...jiraActivities, ...githubActivities].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  logger.info("Activity", `Found ${jiraActivities.length} JIRA, ${githubActivities.length} GitHub = ${allActivities.length} total`);

  const result = { activities: allActivities };
  apiCache.set(cacheKey, result, SHORT_CACHE_TTL);
  res.json(result);
});

function truncatePreview(text: string): string {
  const trimmed = text.slice(0, COMMENT_PREVIEW_LENGTH);
  return trimmed + (text.length > COMMENT_PREVIEW_LENGTH ? "..." : "");
}

// Helper: Extract comments from issues by user
async function extractUserComments(
  jira: any,
  issues: any[],
  userAccountId: string,
  cutoffTime: number,
): Promise<ActivityItem[]> {
  const activities: ActivityItem[] = [];
  const config = getConfig();

  for (const issue of issues) {
    const comments = issue.fields?.comment?.comments || [];
    for (const comment of comments) {
      if (comment.author?.accountId !== userAccountId) continue;
      const commentTime = new Date(comment.created).getTime();
      if (commentTime < cutoffTime) continue;

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
    }
  }

  return activities;
}

async function fetchJiraActivity(): Promise<ActivityItem[]> {
  const config = getConfig();
  const jira = createJiraClient();
  const activities: ActivityItem[] = [];

  try {
    // Fetch issues created by user in last 24h
    const { data: createdData } = await jira.post("/search/jql", {
      jql: `creator = currentUser() AND created >= -${ACTIVITY_LOOKBACK_DAYS}d ORDER BY created DESC`,
      fields: ["summary", "created"],
      maxResults: 20,
    });

    for (const issue of createdData.issues || []) {
      activities.push({
        id: `jira-created-${issue.key}`,
        type: "jira",
        action: "Created ticket",
        title: `${issue.key}: ${issue.fields.summary}`,
        url: `${config.jiraBaseUrl}/browse/${issue.key}`,
        timestamp: issue.fields.created,
        entityKey: issue.key,
      });
    }
  } catch (err) {
    logError("Activity/JIRA created", err, { query: `creator = currentUser() AND created >= -${ACTIVITY_LOOKBACK_DAYS}d` });
  }

  try {
    const { data: userData } = await jira.get("/myself");
    const userAccountId = userData.accountId;
    const cutoffTime = Date.now() - ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    // Query issues the user commented on recently
    const { data: commentedIssues } = await jira.post("/search/jql", {
      jql: `comment ~ currentUser() AND updated >= -${ACTIVITY_LOOKBACK_DAYS}d ORDER BY updated DESC`,
      fields: ["summary"],
      maxResults: 100,
    });

    const issues = commentedIssues.issues || [];
    logger.info("Activity/JIRA", `Fetching comments for ${issues.length} issues`);

    // Fetch comments per issue to get full list (search only returns partial)
    const commentPromises = issues.slice(0, 30).map(async (issue: any) => {
      try {
        const { data } = await jira.get(`/issue/${issue.key}/comment`, { params: { maxResults: 50, orderBy: "-created" } });
        return { issue, comments: data.comments || [] };
      } catch {
        return { issue, comments: [] };
      }
    });
    const issueComments = await Promise.all(commentPromises);

    let commentCount = 0;
    for (const { issue, comments } of issueComments) {
      for (const comment of comments) {
        if (comment.author?.accountId !== userAccountId) continue;
        const commentTime = new Date(comment.created).getTime();
        if (commentTime < cutoffTime) continue;

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
  } catch (err) {
    logError("Activity/JIRA comments", err);
  }

  // Fetch status transitions made by user
  try {
    const { data: userData2 } = await jira.get("/myself");
    const userAccountId2 = userData2.accountId;
    const cutoffTime2 = Date.now() - ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

    const { data: transitionIssues } = await jira.post("/search/jql", {
      jql: `assignee was currentUser() AND status changed AFTER -${ACTIVITY_LOOKBACK_DAYS}d ORDER BY updated DESC`,
      fields: ["summary", "status"],
      maxResults: 50,
    });

    const issueKeys = (transitionIssues.issues || []).map((i: any) => i.key);
    const summaryMap = new Map<string, string>();
    for (const issue of transitionIssues.issues || []) {
      summaryMap.set(issue.key, issue.fields?.summary || "");
    }

    // Fetch changelogs in parallel (batched to avoid rate limits)
    const changelogPromises = issueKeys.slice(0, 20).map(async (key: string) => {
      try {
        const { data } = await jira.get(`/issue/${key}/changelog`, { params: { maxResults: 50 } });
        return { key, histories: data.values || [] };
      } catch {
        return { key, histories: [] };
      }
    });
    const changelogs = await Promise.all(changelogPromises);

    for (const { key, histories } of changelogs) {
      for (const history of histories) {
        if (history.author?.accountId !== userAccountId2) continue;
        const historyTime = new Date(history.created).getTime();
        if (historyTime < cutoffTime2) continue;

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

    logger.info("Activity/JIRA", `Transitions checked: ${issueKeys.length} issues, ${changelogs.reduce((s, c) => s + c.histories.length, 0)} changelog entries`);
  } catch (err) {
    logError("Activity/JIRA transitions", err);
  }

  return activities;
}

async function fetchGitHubActivity(): Promise<ActivityItem[]> {
  const config = getConfig();
  const github = createGitHubClient();
  const activities: ActivityItem[] = [];
  const thirtyDaysAgo = Date.now() - ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
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

  try {
    const { data: events } = await github.get(`/users/${config.githubUsername}/events`, { params: { per_page: 300 } });

    logger.info("Activity", `GitHub events: ${events.length} raw`);

    // Filter to last 24h events first
    const recentEvents = events.filter((e: any) => new Date(e.created_at).getTime() >= thirtyDaysAgo);

    // Collect unique PR references that need title lookup (events API returns abbreviated PR objects without title)
    const prRefs = new Map<string, { owner: string; repo: string; number: number }>();
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
    }

    // Batch fetch PR titles via GraphQL
    const prTitles = new Map<string, string>();
    if (prRefs.size > 0) {
      try {
        const fragments = Array.from(prRefs.entries()).map(([key, ref], i) =>
          `pr${i}: repository(owner: "${ref.owner}", name: "${ref.repo}") { pullRequest(number: ${ref.number}) { title } }`,
        );
        const query = `query { ${fragments.join("\n")} }`;
        const data = await graphql(query, {}, "activity/pr-titles");
        Array.from(prRefs.keys()).forEach((key, i) => {
          const title = data[`pr${i}`]?.pullRequest?.title;
          if (title) prTitles.set(key, title);
        });
        logger.info("Activity", `Fetched ${prTitles.size} PR titles via GraphQL`);
      } catch (err) {
        logError("Activity/GitHub PR titles", err, { prCount: prRefs.size });
      }
    }

    // Helper to resolve PR title
    const getPRTitle = (repo: string, pr: any): string => {
      if (pr.title) return pr.title;
      return prTitles.get(`${repo}#${pr.number}`) || `PR #${pr.number}`;
    };

    // Cache for PR merger info fetched via REST
    const prMergerCache = new Map<string, string | null>();
    const getPRMerger = async (repo: string, prNumber: number): Promise<string | null> => {
      const key = `${repo}#${prNumber}`;
      if (prMergerCache.has(key)) return prMergerCache.get(key) || null;
      try {
        const [owner, repoName] = repo.split("/");
        const { data: prData } = await github.get(`/repos/${owner}/${repoName}/pulls/${prNumber}`);
        const merger = prData.merged_by?.login || null;
        prMergerCache.set(key, merger);
        return merger;
      } catch (err) {
        prMergerCache.set(key, null);
        return null;
      }
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

          // Only show meaningful PR actions, skip synchronize/edited/reopened noise
          let action = "";
          if (prAction === "opened") action = "Created PR";
          else if (prAction === "closed" && pr.merged) {
            // Verify user merged it, not someone else
            const merger = await getPRMerger(repo, pr.number);
            if (merger === config.githubUsername) action = "Merged PR";
            else continue; // Skip if someone else merged
          } else if (prAction === "closed") action = "Closed PR";
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

          // Only show approval/changes_requested, skip generic "reviewed" (always paired with a comment)
          if (review?.state === "approved") {
            activities.push({
              id: `github-review-${event.id}`,
              type: "github",
              action: "Approved PR",
              title: `${repo}#${pr.number}: ${getPRTitle(repo, pr)}`,
              url: pr.html_url || `https://github.com/${repo}/pull/${pr.number}`,
              timestamp: event.created_at,
              entityKey: `${repo}#${pr.number}`,
              metadata: { state: review?.state, actor: userActor },
            });
          } else if (review?.state === "changes_requested") {
            activities.push({
              id: `github-review-${event.id}`,
              type: "github",
              action: "Changes Requested",
              title: `${repo}#${pr.number}: ${getPRTitle(repo, pr)}`,
              url: pr.html_url || `https://github.com/${repo}/pull/${pr.number}`,
              timestamp: event.created_at,
              entityKey: `${repo}#${pr.number}`,
              metadata: { state: review?.state, actor: userActor },
            });
          }
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

    for (const [repoFullName, branches] of pushBranches) {
      for (const branch of branches) {
        try {
          const commits = await fetchAllCommits(github, repoFullName, {
            sha: branch, author: config.githubUsername, since,
          });
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
        } catch (err: any) {
          if (err?.response?.status === 404) {
            logger.warn("Activity", `Repo not found: ${repoFullName}@${branch}`);
          } else {
            logError("Activity/GitHub commits", err, { repo: repoFullName, branch });
          }
        }
      }
    }
  } catch (err) {
    logger.error("Activity", "Failed to fetch GitHub events", { error: String(err) });
  }

  // Discover ALL repos with commits via GraphQL (events API limited to 300 events)
  const sinceDate = new Date(thirtyDaysAgo).toISOString().slice(0, 10);
  const untilDate = new Date().toISOString().slice(0, 10);
  try {
    const repoDiscovery = await graphql<{
      viewer: {
        contributionsCollection: {
          commitContributionsByRepository: { repository: { nameWithOwner: string; defaultBranchRef: { name: string } | null } }[];
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
    );

    const repos = repoDiscovery.viewer.contributionsCollection.commitContributionsByRepository || [];
    let supplementCount = 0;

    for (const entry of repos) {
      const repoFullName = entry.repository.nameWithOwner;
      const defaultBranch = entry.repository.defaultBranchRef?.name || "main";

      // Skip repos already fetched via events
      if (pushBranches.has(repoFullName)) continue;

      try {
        const commits = await fetchAllCommits(github, repoFullName, {
          sha: defaultBranch, author: config.githubUsername, since,
        });
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
      } catch (err: any) {
        if (err?.response?.status === 404) {
          logger.warn("Activity", `Repo not found: ${repoFullName}@${defaultBranch}`);
        } else {
          logError("Activity/GitHub commit supplement", err, { repo: repoFullName });
        }
      }
    }

    logger.info("Activity", `GraphQL repo discovery: ${repos.length} repos, ${supplementCount} extra commits`);
  } catch (err) {
    logError("Activity/GitHub repo discovery", err);
  }
  const seenEntityKeys = new Set(activities.filter((a) => a.action.includes("PR")).map((a) => a.entityKey));

  const PR_ACTIVITY_QUERY = `
    query($query: String!, $first: Int!) {
      search(query: $query, type: ISSUE, first: $first) {
        nodes {
          ... on PullRequest {
            number
            title
            url
            state
            merged
            createdAt
            mergedAt
            closedAt
            author { login avatarUrl }
            mergedBy { login avatarUrl }
            repository { nameWithOwner }
          }
        }
      }
    }
  `;

  try {

    const result = await graphql<{ search: { nodes: any[] } }>(PR_ACTIVITY_QUERY, {
      query: `author:${config.githubUsername} type:pr created:>=${sinceDate}`,
      first: 100,
    }, "activity/pr-supplement");

    for (const pr of result.search.nodes || []) {
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

      if (pr.merged && pr.mergedAt && pr.mergedBy?.login === config.githubUsername && !seenEntityKeys.has(`${entityKey}-merged`)) {
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

    logger.info("Activity", `GraphQL PR supplement: ${result.search.nodes?.length || 0} PRs checked`);
  } catch (err) {
    logError("Activity/GitHub GraphQL PRs", err);
  }

  // Fetch PRs user merged (including org repos) via involves: search + mergedBy filter
  try {
    const mergedResult = await graphql<{ search: { nodes: any[] } }>(PR_ACTIVITY_QUERY, {
      query: `involves:${config.githubUsername} type:pr is:merged merged:>=${sinceDate}`,
      first: 100,
    }, "activity/merged-prs");

    let mergedCount = 0;
    for (const pr of mergedResult.search.nodes || []) {
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
    logger.info("Activity", `GraphQL merged PRs: ${mergedResult.search.nodes?.length || 0} checked, ${mergedCount} by user`);
  } catch (err) {
    logError("Activity/GitHub merged PRs", err);
  }

  logger.info("Activity", `GitHub: ${activities.length} activities`);
  return activities;
}

export default router;
