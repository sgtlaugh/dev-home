import { Router, Request, Response } from "express";
import { createJiraClient } from "../clients/jiraApiClient";
import { apiCache } from "../utils/cache";
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
 * Convert an ADF node to markdown-ish text for display purposes.
 */
function adfToMarkdown(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;

  switch (node.type) {
    case "doc":
      return (node.content || []).map(adfToMarkdown).join("\n\n");

    case "paragraph":
      return (node.content || []).map(adfToMarkdown).join("");

    case "heading": {
      const level = node.attrs?.level || 1;
      const prefix = "#".repeat(level);
      const text = (node.content || []).map(adfToMarkdown).join("");
      return `${prefix} ${text}`;
    }

    case "bulletList":
      return (node.content || []).map(adfToMarkdown).join("\n");

    case "orderedList":
      return (node.content || [])
        .map((child: any, i: number) => {
          const text = adfToMarkdown(child);
          // Replace leading "- " with numbered prefix
          return text.replace(/^- /, `${i + 1}. `);
        })
        .join("\n");

    case "listItem": {
      const inner = (node.content || []).map(adfToMarkdown).join("\n");
      return `- ${inner}`;
    }

    case "blockquote": {
      const text = (node.content || []).map(adfToMarkdown).join("\n");
      return text
        .split("\n")
        .map((line: string) => `> ${line}`)
        .join("\n");
    }

    case "codeBlock": {
      const lang = node.attrs?.language || "";
      const text = (node.content || []).map(adfToMarkdown).join("");
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }

    case "rule":
      return "---";

    case "text": {
      let text = node.text || "";
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case "strong":
              text = `**${text}**`;
              break;
            case "em":
              text = `*${text}*`;
              break;
            case "code":
              text = `\`${text}\``;
              break;
            case "strike":
              text = `~~${text}~~`;
              break;
            case "link":
              text = `[${text}](${mark.attrs?.href || ""})`;
              break;
          }
        }
      }
      return text;
    }

    case "hardBreak":
      return "\n";

    case "mention": {
      const mentionText = node.attrs?.text || node.attrs?.id || "";
      return mentionText.startsWith("@") ? mentionText : `@${mentionText}`;
    }

    case "inlineCard":
      return node.attrs?.url || "";

    case "table":
      return (node.content || []).map(adfToMarkdown).join("\n");

    case "tableRow":
      return "| " + (node.content || []).map((cell: any) => adfToMarkdown(cell)).join(" | ") + " |";

    case "tableHeader":
    case "tableCell":
      return (node.content || []).map(adfToMarkdown).join("");

    case "mediaSingle":
    case "media":
      return "";

    default:
      // Fallback: recurse into content
      if (node.content) {
        return (node.content || []).map(adfToMarkdown).join("");
      }
      return node.text || "";
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
      jql: `(comment ~ currentUser() OR assignee = currentUser()) AND updated >= -90d ORDER BY updated DESC`,
      fields: ["summary", "comment", "assignee"],
      maxResults: 50,
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
  apiCache.set(cacheKey, result);
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

  const isAllowedAvatarDomain = (u: string): boolean => {
    try {
      const host = new URL(u).hostname;
      return (
        host.endsWith(".atlassian.net") ||
        host.endsWith(".atlassian.com") ||
        host.endsWith(".gravatar.com") ||
        host.endsWith(".wp.com") ||
        host === "gravatar.com"
      );
    } catch {
      return false;
    }
  };

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

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
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

// Helper: Get week key for grouping (Monday-Sunday, returned as "YYYY-MM-DD")
function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split("T")[0];
}

function generateWeekKeysInRange(startDateStr: string, endDateStr: string): string[] {
  const weeks: string[] = [];
  const [startY, startM, startD] = startDateStr.split("-").map(Number);
  const [endY, endM, endD] = endDateStr.split("-").map(Number);

  let current = new Date(Date.UTC(startY, startM - 1, startD));
  const end = new Date(Date.UTC(endY, endM - 1, endD));

  const day = current.getUTCDay();
  const diff = current.getUTCDate() - day + (day === 0 ? -6 : 1);
  current.setUTCDate(diff);

  while (current <= end) {
    weeks.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 7);
  }

  return weeks;
}

function formatWeekRange(startDateStr: string): string {
  const [year, month, day] = startDateStr.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(year, month - 1, day + 6));
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
  return `${fmt(start)} - ${fmt(end)}`;
}

// Helper: Calculate completion time in days
function getCompletionTime(issue: any): number {
  const created = new Date(issue.fields?.created || new Date());
  const resolved = new Date(issue.fields?.resolutiondate || new Date());
  const days = (resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, days);
}

// Helper: Format time as "Xd" (rounded up) or "Xh" if < 1 day
function formatCompletionTime(days: number): { value: string; days: number } {
  if (days < 1) {
    // Less than 1 day: show hours, minimum 1h
    const hours = Math.max(1, Math.ceil(days * 24));
    return { value: `${hours}h`, days };
  }
  // 1+ days: show as days (rounded up)
  const roundedDays = Math.ceil(days);
  return { value: `${roundedDays}d`, days };
}

// Helper: Calculate velocity metrics
function calculateVelocityMetrics(
  issues: any[],
  startDate: string,
  endDate: string,
  spFieldId?: string | null,
): Record<string, any> {
  const completionTimes: number[] = [];
  const completionsByWeekMap = new Map<
    string,
    { count: number; storyPoints: number; issues: string[] }
  >();
  let totalStoryPoints = 0;

  for (const issue of issues) {
    const time = getCompletionTime(issue);
    completionTimes.push(time);
    const sp = spFieldId ? Number(issue.fields?.[spFieldId]) || 0 : 0;
    totalStoryPoints += sp;

    const weekKey = getWeekKey(new Date(issue.fields?.resolutiondate));
    const entry = completionsByWeekMap.get(weekKey) || { count: 0, storyPoints: 0, issues: [] };
    entry.count++;
    entry.storyPoints += sp;
    entry.issues.push(issue.key);
    completionsByWeekMap.set(weekKey, entry);
  }

  let allWeeks = generateWeekKeysInRange(startDate, endDate);
  if (allWeeks.length % 2 !== 0 && allWeeks.length > 1) {
    allWeeks = allWeeks.slice(1);
  }
  const completionsByWeek = allWeeks
    .sort((a, b) => b.localeCompare(a))
    .map((weekKey) => {
      const data = completionsByWeekMap.get(weekKey);
      return {
        weekRange: formatWeekRange(weekKey),
        count: data?.count || 0,
        storyPoints: data?.storyPoints || 0,
        issues: data?.issues || [],
      };
    });

  const sortedTimes = [...completionTimes].sort((a, b) => a - b);
  const mean =
    completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;
  const median = completionTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length / 2)] : 0;
  const fastest = sortedTimes.length > 0 ? sortedTimes[0] : 0;
  const slowest = sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1] : 0;

  const totalWeeks = completionsByWeek.length || 1;
  const tasksPerWeek = issues.length / totalWeeks;

  const currentWeekCount = completionsByWeek.length > 0 ? completionsByWeek[0].count : 0;
  const previousWeekCount = completionsByWeek.length > 1 ? completionsByWeek[1].count : 0;

  let trend: "improving" | "stable" | "declining" = "stable";
  let trendPercentage = 0;
  if (completionsByWeek.length >= 2) {
    const midpoint = Math.ceil(completionsByWeek.length / 2);
    const useSP = totalStoryPoints > 0;
    const metric = (w: { count: number; storyPoints: number }) => (useSP ? w.storyPoints : w.count);
    const recentHalf = completionsByWeek.slice(0, midpoint).reduce((sum, w) => sum + metric(w), 0);
    const olderHalf = completionsByWeek.slice(midpoint).reduce((sum, w) => sum + metric(w), 0);

    if (olderHalf > 0) {
      trendPercentage = ((recentHalf - olderHalf) / olderHalf) * 100;
      if (trendPercentage > 10) trend = "improving";
      else if (trendPercentage < -10) trend = "declining";
    }
  }

  const meanFormatted = formatCompletionTime(mean);
  const medianFormatted = formatCompletionTime(median);
  const fastestFormatted = formatCompletionTime(fastest);
  const slowestFormatted = formatCompletionTime(slowest);

  return {
    period: { startDate, endDate },
    totalCompleted: issues.length,
    totalStoryPoints,
    storyPointsPerWeek: Math.round((totalStoryPoints / totalWeeks) * 100) / 100,
    completionsByWeek,
    averageCompletionTime: {
      mean: meanFormatted.value,
      meanDays: Math.round(mean * 100) / 100,
      median: medianFormatted.value,
      medianDays: Math.round(median * 100) / 100,
      fastest: fastestFormatted.value,
      fastestDays: Math.round(fastest * 100) / 100,
      slowest: slowestFormatted.value,
      slowestDays: Math.round(slowest * 100) / 100,
    },
    velocity: {
      tasksPerWeek: Math.round(tasksPerWeek * 100) / 100,
      currentWeek: currentWeekCount,
      previousWeek: previousWeekCount,
      trend,
      trendPercentage: Math.round(trendPercentage * 100) / 100,
    },
  };
}

export default router;
