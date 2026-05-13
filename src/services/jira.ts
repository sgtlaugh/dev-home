import { JiraIssue, JiraComment } from "../types";
import { apiClient } from "./config";
import { apiCache } from "../utils/cache";
import { withRetry } from "../utils/retry";

export async function fetchAssignedIssues(): Promise<JiraIssue[]> {
  const cacheKey = "jira:issues";
  const cached = apiCache.get<JiraIssue[]>(cacheKey);
  if (cached) return cached;

  const { data } = await withRetry(() => apiClient.get("/jira/issues"));
  apiCache.set(cacheKey, data.issues);
  return data.issues;
}

export async function fetchRecentMentions(): Promise<JiraComment[]> {
  const cacheKey = "jira:mentions";
  const cached = apiCache.get<JiraComment[]>(cacheKey);
  if (cached) return cached;

  const { data } = await withRetry(() => apiClient.get("/jira/mentions"));
  apiCache.set(cacheKey, data.comments);
  return data.comments;
}
