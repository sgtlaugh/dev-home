import { apiClient } from "./config";

export interface ActivityItem {
  id: string;
  type: "jira" | "github";
  action: string;
  title: string;
  url: string;
  timestamp: string;
  entityKey: string;
  metadata?: Record<string, any>;
}

export async function fetchActivity(): Promise<ActivityItem[]> {
  const { data } = await apiClient.get("/activity");
  return data.activities;
}

export interface ActivityCount {
  github: number;
  jira: number;
  total: number;
}

export async function fetchActivityCount(): Promise<ActivityCount> {
  const { data } = await apiClient.get("/activity/count");
  return data;
}
