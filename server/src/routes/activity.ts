import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { createJiraClient } from "../clients/jiraApiClient";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import { apiCache } from "../utils/cache";
import { logError } from "../utils/errors";
import { logger } from "../utils/logger";

const router = Router();

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
  apiCache.set(cacheKey, result);
  res.json(result);
});

// Helper: Extract comments from issues by user
async function extractUserComments(
  jira: any,
  issues: any[],
  userAccountId: string,
  twoDaysAgo: number,
): Promise<ActivityItem[]> {
  const activities: ActivityItem[] = [];
  const config = getConfig();

  for (const issue of issues) {
    const comments = issue.fields?.comment?.comments || [];
    for (const comment of comments) {
      if (comment.author?.accountId !== userAccountId) continue;
      const commentTime = new Date(comment.created).getTime();
      if (commentTime < twoDaysAgo) continue;

      activities.push({
        id: `jira-comment-${comment.id}`,
        type: "jira",
        action: "Commented on ticket",
        title: `${issue.key}: ${issue.fields.summary}`,
        url: `${config.jiraBaseUrl}/browse/${issue.key}?focusedCommentId=${comment.id}`,
        timestamp: comment.created,
        entityKey: issue.key,
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
      jql: `creator = currentUser() AND created >= -2d ORDER BY created DESC`,
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
    logError("Activity/JIRA created", err, { query: `creator = currentUser() AND created >= -2d` });
  }

  try {
    // Fetch all issues updated in last 24h, extract your comments
    const { data: userData } = await jira.get("/myself");
    const userAccountId = userData.accountId;
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

    const { data: allIssues } = await jira.post("/search/jql", {
      jql: `updated >= -2d ORDER BY updated DESC`,
      fields: ["summary", "comment"],
      maxResults: 250,
    });

    const userComments = await extractUserComments(jira, allIssues.issues || [], userAccountId, twoDaysAgo);
    activities.push(...userComments);
  } catch (err) {
    logError("Activity/JIRA comments", err, { query: `updated >= -2d` });
  }

  return activities;
}

async function fetchGitHubActivity(): Promise<ActivityItem[]> {
  const config = getConfig();
  const github = createGitHubClient();
  const activities: ActivityItem[] = [];
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

  try {
    // Use authenticated user events endpoint - includes full commit data for private repos
    const { data: events } = await github.get(`/users/${config.githubUsername}/events`, {
      params: { per_page: 300 },
    });

    logger.info("Activity", `GitHub events: ${events.length} raw`);

    // Filter to last 24h events first
    const recentEvents = events.filter((e: any) => new Date(e.created_at).getTime() >= twoDaysAgo);

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
        const data = await graphql(query);
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

    const seenShas = new Set<string>();

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
          else if (prAction === "closed" && pr.merged) action = "Merged PR";
          else if (prAction === "closed") action = "Closed PR";
          if (!action) break;

          activities.push({
            id: `github-pr-${event.id}`,
            type: "github",
            action,
            title: `${repo}#${pr.number}: ${getPRTitle(repo, pr)}`,
            url: pr.html_url || `https://github.com/${repo}/pull/${pr.number}`,
            timestamp: event.created_at,
            entityKey: `${repo}#${pr.number}`,
          });
          break;
        }
        case "PullRequestReviewEvent": {
          const review = event.payload?.review;
          const pr = event.payload?.pull_request;
          if (!pr) break;

          let action = "Reviewed PR";
          if (review?.state === "approved") action = "Approved PR";
          else if (review?.state === "changes_requested") action = "Requested changes";

          activities.push({
            id: `github-review-${event.id}`,
            type: "github",
            action,
            title: `${repo}#${pr.number}: ${getPRTitle(repo, pr)}`,
            url: pr.html_url || `https://github.com/${repo}/pull/${pr.number}`,
            timestamp: event.created_at,
            entityKey: `${repo}#${pr.number}`,
            metadata: { state: review?.state },
          });
          break;
        }
        case "IssueCommentEvent": {
          const comment = event.payload?.comment;
          const issue = event.payload?.issue;
          if (!issue) break;

          const isPR = !!issue.pull_request;
          activities.push({
            id: `github-comment-${event.id}`,
            type: "github",
            action: `Commented on ${isPR ? "PR" : "issue"}`,
            title: `${repo}#${issue.number}: ${issue.title}`,
            url: comment?.html_url || issue.html_url,
            timestamp: event.created_at,
            entityKey: `${repo}#${issue.number}`,
          });
          break;
        }
        case "PullRequestReviewCommentEvent": {
          const comment = event.payload?.comment;
          const pr = event.payload?.pull_request;
          if (!pr) break;

          activities.push({
            id: `github-comment-${event.id}`,
            type: "github",
            action: "Commented on PR",
            title: `${repo}#${pr.number}: ${getPRTitle(repo, pr)}`,
            url: comment?.html_url || `https://github.com/${repo}/pull/${pr.number}`,
            timestamp: event.created_at,
            entityKey: `${repo}#${pr.number}`,
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
          });
          break;
        }
      }
    }
    // Fetch commits separately - events API strips commit data from private repos
    const pushBranches = new Map<string, Set<string>>();
    for (const event of recentEvents) {
      if (event.type === "PushEvent" && event.repo?.name) {
        const repo = event.repo.name;
        const branch = (event.payload?.ref || "").replace("refs/heads/", "");
        if (!branch) continue;
        if (!pushBranches.has(repo)) pushBranches.set(repo, new Set());
        pushBranches.get(repo)!.add(branch);
      }
    }

    const since = new Date(twoDaysAgo).toISOString();
    for (const [repoFullName, branches] of pushBranches) {
      for (const branch of branches) {
        try {
          const { data: commits } = await github.get(`/repos/${repoFullName}/commits`, {
            params: { sha: branch, author: config.githubUsername, since, per_page: 100 },
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

  logger.info("Activity", `GitHub: ${activities.length} activities`);
  return activities;
}

export default router;
