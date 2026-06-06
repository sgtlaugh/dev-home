import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../services/config";
import { apiCache } from "../utils/cache";

export interface LeaderboardEntry {
  login: string;
  avatarUrl: string;
  name: string | null;
  commits: number;
  prs: number;
  reviews: number;
}

export interface OrgInfo {
  login: string;
  avatarUrl: string;
}

export function useUserOrgs(configured: boolean) {
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!configured) return;
    const cacheKey = "user-orgs";
    const cached = apiCache.get<OrgInfo[]>(cacheKey);
    if (cached) {
      setOrgs(cached);
      return;
    }

    setLoading(true);
    apiClient
      .get<{ orgs: OrgInfo[] }>("/github/user-orgs")
      .then(({ data }) => {
        setOrgs(data.orgs);
        apiCache.set(cacheKey, data.orgs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [configured]);

  return { orgs, loading };
}

export function useOrgLeaderboard(
  configured: boolean,
  org: string | null,
  startDate: string,
  endDate: string,
) {
  const [members, setMembers] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefetchRunning, setPrefetchRunning] = useState(false);

  const fetch = useCallback(async () => {
    if (!configured || !org || !startDate || !endDate) return;

    const cacheKey = `org-leaderboard:${org}:${startDate}:${endDate}`;
    const cached = apiCache.get<LeaderboardEntry[]>(cacheKey);
    if (cached) {
      setMembers(cached);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<{
        members: LeaderboardEntry[];
        prefetchRunning: boolean;
      }>("/github/org-leaderboard", { params: { org, startDate, endDate } });
      setMembers(data.members);
      setPrefetchRunning(data.prefetchRunning);
      apiCache.set(cacheKey, data.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch leaderboard");
    } finally {
      setLoading(false);
    }
  }, [configured, org, startDate, endDate]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { members, loading, error, prefetchRunning, refresh: fetch };
}
