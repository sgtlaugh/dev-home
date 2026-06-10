import { useState, useEffect, useCallback, useRef } from "react";
import { JiraVelocityMetrics, CompletedIssue } from "../types";
import { fetchVelocityData } from "../services/jira";

export function useJiraVelocity(
  startDate: string,
  endDate: string,
  active: boolean,
  onFetchComplete?: (label: string, ms: number) => void,
) {
  const [metrics, setMetrics] = useState<JiraVelocityMetrics | null>(null);
  const [completedIssues, setCompletedIssues] = useState<CompletedIssue[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    if (!active || !startDate || !endDate) {
      setMetrics(null);
      setCompletedIssues([]);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);

    const start = Date.now();
    try {
      const data = await fetchVelocityData(startDate, endDate, signal);
      if (!signal.aborted) {
        setMetrics(data.metrics);
        setCompletedIssues(data.completedIssues);
        onFetchComplete?.("Velocity", Date.now() - start);
      }
    } catch (err: any) {
      if (!signal.aborted) {
        setError(err?.message || "Failed to fetch velocity metrics");
        console.error("Failed to fetch velocity metrics:", err);
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [startDate, endDate, active]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const refresh = useCallback(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    metrics,
    completedIssues,
    loading,
    error,
    refresh,
  };
}
