import { Router, Request, Response } from "express";
import { getConfig } from "../config";
import { createJiraClient } from "../clients/jiraApiClient";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import { apiCache } from "../utils/cache";

const router = Router();

interface ActivityItem {
  id: string;
  type: "jira" | "github";
  action: string;
  title: string;
  url: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * GET /api/activity
 * Fetch recent activity from JIRA and GitHub (last 24 hours)
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

  console.log(`[Activity] Found ${jiraActivities.length} JIRA, ${githubActivities.length} GitHub = ${allActivities.length} total`);

  const result = { activities: allActivities };
  apiCache.set(cacheKey, result);
  res.json(result);
});

async function fetchJiraActivity(): Promise<ActivityItem[]> {
  const config = getConfig();
  const jira = createJiraClient();
  const activities: ActivityItem[] = [];

  try {
    // Fetch issues created by user in last 24h
    const { data: createdData } = await jira.post("/search/jql", {
      jql: `creator = currentUser() AND created >= -1d ORDER BY created DESC`,
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
      });
    }
  } catch (err) {
    console.error("[Activity] Failed to fetch created tickets:", err);
  }

  try {
    // Fetch recent comments by current user
    // Note: Using assignee filter as proxy since "commented by currentUser()" may not work
    const { data: assignedData } = await jira.post("/search/jql", {
      jql: `assignee = currentUser() AND updated >= -1d ORDER BY updated DESC`,
      fields: ["summary", "comment"],
      maxResults: 30,
    });

    const { data: userData } = await jira.get("/myself");
    const userAccountId = userData.accountId;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const issue of assignedData.issues || []) {
      const comments = issue.fields?.comment?.comments || [];

      for (const comment of comments) {
        if (comment.author?.accountId !== userAccountId) continue;
        const commentTime = new Date(comment.created).getTime();
        if (commentTime < oneDayAgo) continue;

        activities.push({
          id: `jira-comment-${comment.id}`,
          type: "jira",
          action: "Commented on ticket",
          title: `${issue.key}: ${issue.fields.summary}`,
          url: `${config.jiraBaseUrl}/browse/${issue.key}?focusedCommentId=${comment.id}`,
          timestamp: comment.created,
        });
      }
    }
  } catch (err) {
    console.error("[Activity] Failed to fetch comments:", err);
  }

  return activities;
}

async function fetchGitHubActivity(): Promise<ActivityItem[]> {
  const config = getConfig();
  const github = createGitHubClient();
  const activities: ActivityItem[] = [];
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  try {
    // Use REST events API - real-time, no indexing delay
    const { data: events } = await github.get(`/users/${config.githubUsername}/events`, {
      params: { per_page: 100 },
    });

    console.log(`[Activity] GitHub events: ${events.length} raw events`);

    // Filter to last 24h events first
    const recentEvents = events.filter((e: any) => new Date(e.created_at).getTime() >= oneDayAgo);

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
        console.log(`[Activity] Fetched ${prTitles.size} PR titles via GraphQL`);
      } catch (err) {
        console.error("[Activity] Failed to batch-fetch PR titles:", err);
      }
    }

    // Helper to resolve PR title
    const getPRTitle = (repo: string, pr: any): string => {
      if (pr.title) return pr.title;
      return prTitles.get(`${repo}#${pr.number}`) || `PR #${pr.number}`;
    };

    for (const event of recentEvents) {
      const repo = event.repo?.name || "";

      switch (event.type) {
        case "PushEvent": {
          const commits = event.payload?.commits || [];
          for (const commit of commits) {
            const firstLine = (commit.message || "").split("\n")[0].slice(0, 120);
            activities.push({
              id: `github-commit-${commit.sha}`,
              type: "github",
              action: "Committed",
              title: `${repo}: ${firstLine}`,
              url: `https://github.com/${repo}/commit/${commit.sha}`,
              timestamp: event.created_at,
            });
          }
          break;
        }
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
          });
          break;
        }
      }
    }
  } catch (err) {
    console.error("[Activity] Failed to fetch GitHub events:", err);
  }

  console.log(`[Activity] GitHub: ${activities.length} activities from events`);
  return activities;
}

export default router;
