import { useState, useEffect, useCallback } from "react";
import { ActivityItem, fetchActivity } from "../services/activity";

export function useActivity(active: boolean) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!active) return;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchActivity();
      setActivities(data);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch activity");
      console.error("Failed to fetch activity:", err);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    fetch();
  }, [fetch]);

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
