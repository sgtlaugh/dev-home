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
