import { JiraIssue, JiraComment, JiraVelocityMetrics } from "../types";
import { apiClient } from "./config";
import { apiCache } from "../utils/cache";

export async function fetchAssignedIssues(): Promise<JiraIssue[]> {
  const cacheKey = "jira:issues";
  const cached = apiCache.get<JiraIssue[]>(cacheKey);
  if (cached) return cached;

  const { data } = await apiClient.get("/jira/issues");
  apiCache.set(cacheKey, data.issues);
  return data.issues;
}

export async function fetchRecentMentions(): Promise<JiraComment[]> {
  const cacheKey = "jira:mentions";
  const cached = apiCache.get<JiraComment[]>(cacheKey);
  if (cached) return cached;

  const { data } = await apiClient.get("/jira/mentions");
  apiCache.set(cacheKey, data.comments);
  return data.comments;
}

export async function fetchVelocityMetrics(
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<JiraVelocityMetrics> {
  const cacheKey = `jira:velocity:${startDate}:${endDate}`;
  const cached = apiCache.get<JiraVelocityMetrics>(cacheKey);
  if (cached) return cached;

  const { data } = await apiClient.get("/jira/velocity", {
    params: { startDate, endDate },
    signal,
  });

  const metrics = data.metrics;
  apiCache.set(cacheKey, metrics);
  return metrics;
}
