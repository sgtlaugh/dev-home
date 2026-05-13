import { apiClient } from "./config";
import { apiCache } from "../utils/cache";

export interface ActivityItem {
  id: string;
  type: "jira" | "github";
  action: string;
  title: string;
  url: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export async function fetchActivity(): Promise<ActivityItem[]> {
  const cacheKey = "activity:recent";
  const cached = apiCache.get<ActivityItem[]>(cacheKey);
  if (cached) return cached;

  const { data } = await apiClient.get("/activity");
  apiCache.set(cacheKey, data.activities);
  return data.activities;
}
