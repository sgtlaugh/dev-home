import { Router, Request, Response } from "express";
import { createJiraClient } from "../clients/jiraApiClient";
import { adfToMarkdown } from "../utils/adf";
import { apiCache } from "../utils/cache";
import {
  calculateVelocityMetrics,
  getCompletionTime,
  VELOCITY_DATE_REGEX,
} from "../utils/jiraHelpers";
import { isAllowedAvatarDomain } from "../utils/avatarDomain";
import axios from "axios";
import { logger } from "../utils/logger";

const router = Router();

let storyPointsFieldId: string | null = null;
let storyPointsDetected = false;

export function resetJiraCache(): void {
  storyPointsFieldId = null;
  storyPointsDetected = false;
  avatarCache.clear();
}

async function getStoryPointsFieldId(): Promise<string | null> {
  if (storyPointsDetected) return storyPointsFieldId;

  try {
    const jira = createJiraClient();
    const { data } = await jira.get("/field");
    const field = data.find(
      (f: any) =>
        /story.?point/i.test(f.name) || f.key === "story_points" || f.id === "story_points",
    );
    storyPointsFieldId = field?.id || field?.key || null;
    storyPointsDetected = true;
    logger.info("JIRA", `Story points field: ${storyPointsFieldId || "not found"}`);
    return storyPointsFieldId;
  } catch (err) {
    logger.warn("JIRA", `Failed to detect story points field: ${err}`);
    return null;
  }
}

/**
 * GET /api/jira/issues
 * Fetch unresolved issues assigned to the current user.
 */
router.get("/issues", async (_req: Request, res: Response) => {
  const cacheKey = "jira:issues";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const jira = createJiraClient();

  const jql = `assignee = currentUser() ORDER BY updated DESC`;
  const spField = await getStoryPointsFieldId();
  const fields = [
    "summary",
    "status",
    "priority",
    "assignee",
    "project",
    "updated",
    "description",
    "issuetype",
    ...(spField ? [spField] : []),
  ];

  const allIssues: any[] = [];
  let nextPageToken: string | undefined;
  const pageSize = 100;
  while (true) {
    const payload: any = { jql, fields, maxResults: pageSize };
    if (nextPageToken) payload.nextPageToken = nextPageToken;
    const { data } = await jira.post("/search/jql", payload);
    const batch = data.issues || data || [];
    allIssues.push(...batch);
    if (!data.nextPageToken || batch.length < pageSize) break;
    nextPageToken = data.nextPageToken;
  }

  const issues = allIssues.map((issue: any) => ({
    key: issue.key,
    summary: issue.fields?.summary,
    status: {
      name: issue.fields?.status?.name,
      statusCategory: {
        colorName: issue.fields?.status?.statusCategory?.colorName,
      },
    },
    priority: {
      name: issue.fields?.priority?.name,
      iconUrl: issue.fields?.priority?.iconUrl,
    },
    assignee: {
      displayName: issue.fields?.assignee?.displayName,
      avatarUrls: issue.fields?.assignee?.avatarUrls,
    },
    project: {
      key: issue.fields?.project?.key,
      name: issue.fields?.project?.name,
    },
    updated: issue.fields?.updated,
    self: issue.self,
    description: adfToMarkdown(issue.fields?.description),
    issueType: issue.fields?.issuetype?.name || "Task",
    storyPoints: spField ? Number(issue.fields?.[spField]) || 0 : 0,
  }));

  const result = { issues };
  apiCache.set(cacheKey, result);
  res.json(result);
});

router.get("/mentions", async (_req: Request, res: Response) => {
  const cacheKey = "jira:mentions";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const jira = createJiraClient();

  const [{ data: searchData }, { data: userData }] = await Promise.all([
    jira.post("/search/jql", {
      jql: `(watcher = currentUser() OR assignee = currentUser()) AND updated >= -90d ORDER BY updated DESC`,
      fields: ["summary", "comment", "assignee"],
      maxResults: 250,
    }),
    jira.get("/myself"),
  ]);

  const issues = searchData.issues || [];
  const userAccountId = userData.accountId;
  const username = userData.displayName?.toLowerCase() || "";
  const email = userData.emailAddress?.toLowerCase() || "";

  const allComments = issues.flatMap((issue: any) => {
    const comments = issue.fields?.comment?.comments || [];
    const isAssignedToMe = issue.fields?.assignee?.accountId === userAccountId;
    return comments.reduce((acc: any[], comment: any) => {
      if (comment.author?.accountId === userAccountId) return acc;
      const bodyMarkdown = adfToMarkdown(comment.body);
      const bodyLower = bodyMarkdown.toLowerCase();
      const isMentioned = bodyLower.includes(username) || bodyLower.includes(email);
      if (!isMentioned && !isAssignedToMe) return acc;

      acc.push({
        id: comment.id,
        author: {
          displayName: comment.author?.displayName,
          avatarUrls: comment.author?.avatarUrls,
        },
        body: { text: bodyMarkdown },
        created: comment.created,
        updated: comment.updated,
        self: comment.self,
        issueKey: issue.key,
        issueSummary: issue.fields?.summary,
        type: isMentioned ? "mentioned" : "assigned",
      });
      return acc;
    }, []);
  });

  allComments.sort(
    (a: any, b: any) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
  );

  const result = { comments: allComments };
  // don't cache empty results — may be rate-limited, not genuinely empty
  if (allComments.length > 0) {
    apiCache.set(cacheKey, result);
  }
  res.json(result);
});

const AVATAR_CACHE_MAX = 500;
const avatarCache = new Map<string, { data: Buffer; contentType: string }>();

router.get("/avatar", async (req: Request, res: Response) => {
  const raw = req.originalUrl;
  const prefix = "avatar?url=";
  const idx = raw.indexOf(prefix);
  const url = idx >= 0 ? raw.slice(idx + prefix.length) : "";
  if (!url) return res.status(400).send("Missing url param");

  if (!isAllowedAvatarDomain(url)) {
    return res.status(403).send("Avatar domain not allowed");
  }

  const cached = avatarCache.get(url);
  if (cached) {
    avatarCache.delete(url);
    avatarCache.set(url, cached);
    res.set("Content-Type", cached.contentType);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(cached.data);
  }

  try {
    let fetchUrl = url;

    // Gravatar redirects to fallback URL for users without accounts.
    // The fallback CDN rate-limits aggressively, so extract the d= param and fetch directly.
    if (url.includes("gravatar.com/avatar")) {
      const match = url.match(/[?&]d=([^&]+)/);
      if (match) {
        const head = await axios.head(url, {
          maxRedirects: 0,
          timeout: 3000,
          validateStatus: () => true,
        });
        if (head.status === 302) {
          fetchUrl = decodeURIComponent(match[1]);
          if (!isAllowedAvatarDomain(fetchUrl)) {
            return res.status(403).send("Avatar domain not allowed");
          }
        }
      }
    }

    const response = await axios.get(fetchUrl, { responseType: "arraybuffer", timeout: 5000 });
    const contentType = response.headers["content-type"] || "image/png";
    const data = Buffer.from(response.data);
    if (avatarCache.size >= AVATAR_CACHE_MAX) {
      avatarCache.delete(avatarCache.keys().next().value!);
    }
    avatarCache.set(url, { data, contentType });
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(data);
  } catch {
    res.status(404).send("Avatar not found");
  }
});

/**
 * GET /api/jira/velocity?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Fetch task completion velocity metrics for the date range.
 */
router.get("/velocity", async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query as Record<string, string>;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate required (YYYY-MM-DD)" });
  }

  if (!VELOCITY_DATE_REGEX.test(startDate) || !VELOCITY_DATE_REGEX.test(endDate)) {
    return res.status(400).json({ error: "Invalid date format, expected YYYY-MM-DD" });
  }

  const cacheKey = `jira:velocity:${startDate}:${endDate}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const jira = createJiraClient();

  const spField = await getStoryPointsFieldId();
  const jql = `assignee = currentUser() AND statusCategory = Done AND resolutiondate >= "${startDate}" AND resolutiondate <= "${endDate}" ORDER BY resolutiondate DESC`;
  const fields = [
    "key",
    "summary",
    "created",
    "resolutiondate",
    "issuetype",
    ...(spField ? [spField] : []),
  ];

  const { data } = await jira.post("/search/jql", {
    jql,
    fields,
    maxResults: 500,
  });

  const issues = data.issues || [];
  const metrics = calculateVelocityMetrics(issues, startDate, endDate, spField);

  const completedIssues = issues.map((issue: any) => ({
    key: issue.key,
    summary: issue.fields?.summary || "",
    type: issue.fields?.issuetype?.name || "Task",
    storyPoints: spField ? Number(issue.fields?.[spField]) || 0 : 0,
    resolutiondate: issue.fields?.resolutiondate || "",
    completionDays: Math.round(getCompletionTime(issue) * 10) / 10,
  }));

  const result = { metrics, completedIssues };
  apiCache.set(cacheKey, result);
  res.json(result);
});

export default router;
