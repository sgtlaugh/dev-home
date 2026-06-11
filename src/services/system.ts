import { apiClient } from "./config";

export interface SystemStats {
  memory: { free: number; total: number };
  disk: { free: number; total: number };
  cpu: { usage: number };
}

export async function fetchSystemStats(): Promise<SystemStats> {
  const { data } = await apiClient.get("/system/stats");
  return data;
}
