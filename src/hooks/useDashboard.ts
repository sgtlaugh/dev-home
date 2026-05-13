import { useState, useEffect, useCallback, useRef } from "react";
import { JiraIssue, JiraComment, GitHubPR, GitHubReviewRequest } from "../types";
import { fetchAssignedIssues, fetchRecentMentions } from "../services/jira";
import { fetchDashboard } from "../services/github";
import { apiCache } from "../utils/cache";
import { rateLimiter } from "../utils/rateLimiter";

const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = "dev-home-dashboard-cache";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface DashboardCacheData {
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  timestamp: number;
}

function loadCache(): DashboardCacheData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCacheData;
    // Basic validation: ensure the expected fields exist
    if (
      !Array.isArray(parsed.jiraIssues) ||
      !Array.isArray(parsed.jiraComments) ||
      !Array.isArray(parsed.openPRs) ||
      !Array.isArray(parsed.reviewRequests)
    ) {
      return null;
    }
    // Discard stale cache
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(data: Omit<DashboardCacheData, "timestamp">): void {
  try {
    const cacheEntry: DashboardCacheData = {
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
  } catch {
    // Silently ignore storage errors (e.g. quota exceeded)
  }
}

interface UseDashboardReturn {
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  openPRs: GitHubPR[];
  reviewRequests: GitHubReviewRequest[];
  loading: boolean;
  jiraIssuesLoading: boolean;
  jiraCommentsLoading: boolean;
  openPRsLoading: boolean;
  reviewRequestsLoading: boolean;
  error: string | null;
  refresh: () => void;
  rateLimited: boolean;
  rateLimitResetAt: number | null;
  lastRefreshTime: number | null;
}

export function useDashboard(active: boolean): UseDashboardReturn {
  const cachedRef = useRef(loadCache());
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>(cachedRef.current?.jiraIssues ?? []);
  const [jiraComments, setJiraComments] = useState<JiraComment[]>(
    cachedRef.current?.jiraComments ?? [],
  );
  const [openPRs, setOpenPRs] = useState<GitHubPR[]>(cachedRef.current?.openPRs ?? []);
  const [reviewRequests, setReviewRequests] = useState<GitHubReviewRequest[]>(
    cachedRef.current?.reviewRequests ?? [],
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [jiraIssuesLoading, setJiraIssuesLoading] = useState<boolean>(false);
  const [jiraCommentsLoading, setJiraCommentsLoading] = useState<boolean>(false);
  const [openPRsLoading, setOpenPRsLoading] = useState<boolean>(false);
  const [reviewRequestsLoading, setReviewRequestsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<boolean>(false);
  const [rateLimitResetAt, setRateLimitResetAt] = useState<number | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<number | null>(
    cachedRef.current?.timestamp ?? null,
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const unsubscribe = rateLimiter.subscribe((state) => {
      setRateLimited(state.isLimited);
      setRateLimitResetAt(state.resetAt);
      if (state.isLimited && state.lastError) {
        setError(state.lastError);
      }
    });
    return unsubscribe;
  }, []);

  const fetchAll = useCallback(() => {
    if (!active) return;

    const limitState = rateLimiter.getState();
    if (limitState.isLimited) {
      const cachedData = loadCache();
      if (cachedData && Date.now() - cachedData.timestamp < CACHE_TTL_MS) {
        const ageMinutes = Math.round((Date.now() - cachedData.timestamp) / 60000);
        console.info(`[Cache] Serving stale dashboard data (${ageMinutes}m old) due to rate limit`);
        setJiraIssues(cachedData.jiraIssues);
        setJiraComments(cachedData.jiraComments);
        setOpenPRs(cachedData.openPRs);
        setReviewRequests(cachedData.reviewRequests);
        setError(`${limitState.lastError || "API rate limited"} (showing ${ageMinutes}m old data)`);
        return;
      }
      console.warn("[Cache] No valid cached data available during rate limit");
      setError(limitState.lastError || "API rate limited");
      return;
    }

    // Cancel any in-flight requests
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setJiraIssuesLoading(true);
    setJiraCommentsLoading(true);
    setOpenPRsLoading(true);
    setReviewRequestsLoading(true);
    setError(null);

    // Accumulate results to avoid repeated localStorage reads/writes
    const pendingData: Partial<Omit<DashboardCacheData, "timestamp">> = {};
    let pendingCount = 2;
    const errors: string[] = [];

    const settle = (errorMsg?: string) => {
      if (controller.signal.aborted) return;
      if (errorMsg) errors.push(errorMsg);
      pendingCount -= 1;
      if (pendingCount <= 0) {
        setLoading(false);
        if (errors.length > 0) {
          setError(errors.join("; "));
        } else {
          setLastRefreshTime(Date.now());
        }
        // Save cache once with all accumulated data
        saveCache({
          jiraIssues: pendingData.jiraIssues ?? [],
          jiraComments: pendingData.jiraComments ?? [],
          openPRs: pendingData.openPRs ?? [],
          reviewRequests: pendingData.reviewRequests ?? [],
        });
      }
    };

    fetchAssignedIssues()
      .then((data) => {
        if (controller.signal.aborted) return;
        setJiraIssues(data);
        pendingData.jiraIssues = data;
        setJiraIssuesLoading(false);
        settle();
      })
      .catch((err) => {
        setJiraIssuesLoading(false);
        settle(err?.message || String(err));
      });

    fetchRecentMentions()
      .then((data) => {
        if (controller.signal.aborted) return;
        setJiraComments(data);
        pendingData.jiraComments = data;
        setJiraCommentsLoading(false);
        settle();
      })
      .catch((err) => {
        setJiraCommentsLoading(false);
        settle(err?.message || String(err));
      });

    fetchDashboard()
      .then(({ prs, reviews }) => {
        if (controller.signal.aborted) return;
        setOpenPRs(prs);
        pendingData.openPRs = prs;
        setReviewRequests(reviews);
        pendingData.reviewRequests = reviews;
        setOpenPRsLoading(false);
        setReviewRequestsLoading(false);
        settle();
      })
      .catch((err) => {
        setOpenPRsLoading(false);
        setReviewRequestsLoading(false);
        settle(err?.message || String(err));
      });
  }, [active]);

  // Fetch data when active changes to true, with visibility-based polling
  useEffect(() => {
    if (!active) return;

    fetchAll();

    // Set up polling interval
    intervalRef.current = setInterval(fetchAll, POLLING_INTERVAL_MS);

    // Pause polling when window is hidden, resume when visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        if (!intervalRef.current) {
          fetchAll();
          intervalRef.current = setInterval(fetchAll, POLLING_INTERVAL_MS);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [active, fetchAll]);

  const refresh = useCallback(() => {
    apiCache.invalidate();
    fetchAll();
  }, [fetchAll]);

  return {
    jiraIssues,
    jiraComments,
    openPRs,
    reviewRequests,
    loading,
    jiraIssuesLoading,
    jiraCommentsLoading,
    openPRsLoading,
    reviewRequestsLoading,
    error,
    refresh,
    rateLimited,
    rateLimitResetAt,
    lastRefreshTime,
  };
}
