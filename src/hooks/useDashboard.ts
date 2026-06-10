import { useState, useEffect, useCallback, useRef } from "react";
import { JiraIssue, JiraComment, GitHubPR, GitHubReviewRequest } from "../types";
import { fetchAssignedIssues, fetchRecentMentions } from "../services/jira";
import { fetchDashboard } from "../services/github";
import { apiCache } from "../utils/cache";

const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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
  lastRefreshTime: number | null;
}

export function useDashboard(
  active: boolean,
  onFetchComplete?: (label: string, ms: number) => void,
): UseDashboardReturn {
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);
  const [jiraComments, setJiraComments] = useState<JiraComment[]>([]);
  const [openPRs, setOpenPRs] = useState<GitHubPR[]>([]);
  const [reviewRequests, setReviewRequests] = useState<GitHubReviewRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [jiraIssuesLoading, setJiraIssuesLoading] = useState<boolean>(false);
  const [jiraCommentsLoading, setJiraCommentsLoading] = useState<boolean>(false);
  const [openPRsLoading, setOpenPRsLoading] = useState<boolean>(false);
  const [reviewRequestsLoading, setReviewRequestsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAll = useCallback(() => {
    if (!active) return;

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

    const start = Date.now();
    let pendingCount = 3;
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
          setError(null);
          setLastRefreshTime(Date.now());
          onFetchComplete?.("Dashboard", Date.now() - start);
        }
      }
    };

    fetchAssignedIssues()
      .then((data) => {
        if (controller.signal.aborted) return;
        setJiraIssues(data);
        setJiraIssuesLoading(false);
        settle();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setJiraIssuesLoading(false);
        settle(err?.message || String(err));
      });

    fetchRecentMentions()
      .then((data) => {
        if (controller.signal.aborted) return;
        setJiraComments(data);
        setJiraCommentsLoading(false);
        settle();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setJiraCommentsLoading(false);
        settle(err?.message || String(err));
      });

    fetchDashboard()
      .then(({ prs, reviews }) => {
        if (controller.signal.aborted) return;
        setOpenPRs(prs);
        setReviewRequests(reviews);
        setOpenPRsLoading(false);
        setReviewRequestsLoading(false);
        settle();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
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
    lastRefreshTime,
  };
}
