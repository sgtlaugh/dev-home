import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { apiClient } from "../services/config";
import { apiCache } from "../utils/cache";

interface PrefetchStatus {
  running: boolean;
  monthsDone: number;
  totalMonths: number;
  org: string;
  completedAt: number;
}

export function usePrefetchStatus(active: boolean) {
  const [status, setStatus] = useState<PrefetchStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await apiClient.get<PrefetchStatus>("/github/prefetch-status");
        if (!cancelled) setStatus(data);
      } catch {
        /* polling failure is non-critical */
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active]);

  useEffect(() => {
    if (status?.completedAt && !status.running) {
      timerRef.current = setTimeout(() => setDismissed(true), 30000);
      return () => clearTimeout(timerRef.current);
    }
    if (status?.running) setDismissed(false);
  }, [status?.completedAt, status?.running]);

  const complete = !!(status?.completedAt && !status.running);
  const percentage = status?.totalMonths
    ? Math.round((status.monthsDone / status.totalMonths) * 100)
    : 0;

  return {
    running: status?.running ?? false,
    complete,
    dismissed,
    percentage,
    monthsDone: status?.monthsDone ?? 0,
    totalMonths: status?.totalMonths ?? 0,
    org: status?.org ?? "",
  };
}

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
  onFetchComplete?: (label: string, ms: number) => void,
) {
  const [members, setMembers] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController>();

  const fetch = useCallback(async () => {
    if (!configured || !org || !startDate || !endDate) return;

    const cacheKey = `org-leaderboard:${org}:${startDate}:${endDate}`;
    const cached = apiCache.get<LeaderboardEntry[]>(cacheKey);
    if (cached) {
      setMembers(cached);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    onFetchComplete?.("Leaderboard", -1);
    const start = Date.now();
    try {
      const { data } = await apiClient.get<{ members: LeaderboardEntry[] }>(
        "/github/org-leaderboard",
        { params: { org, startDate, endDate }, signal: controller.signal },
      );
      setMembers(data.members);
      apiCache.set(cacheKey, data.members);
      onFetchComplete?.("Leaderboard", Date.now() - start);
    } catch (err) {
      if (axios.isCancel(err)) return;
      setError(err instanceof Error ? err.message : "Failed to fetch leaderboard");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [configured, org, startDate, endDate]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { members, loading, error, refresh: fetch };
}
