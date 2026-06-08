import { useState, useEffect, useCallback, useRef } from "react";
import { ActivityItem, fetchActivity } from "../services/activity";

const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useActivity(active: boolean) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    if (!active) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchActivity();
      if (controller.signal.aborted) return;
      setActivities(data);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setError(err?.message || "Failed to fetch activity");
      console.error("Failed to fetch activity:", err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;

    fetch();

    intervalRef.current = setInterval(fetch, POLLING_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        if (!intervalRef.current) {
          fetch();
          intervalRef.current = setInterval(fetch, POLLING_INTERVAL_MS);
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
  }, [active, fetch]);

  const refresh = useCallback(() => {
    fetch();
  }, [fetch]);

  return {
    activities,
    loading,
    error,
    refresh,
  };
}
