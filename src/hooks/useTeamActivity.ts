import { useEffect, useRef, useState } from "react";
import { fetchTeamActivity } from "../services/github";
import { ActivityItem } from "../services/activity";

export function useTeamActivity(active: boolean) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const data = await fetchTeamActivity(abortRef.current.signal);
      setActivities(data);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const msg = err.message || "Failed to fetch team activity";
        setError(msg);
        console.error("TeamActivity:", msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    refresh();

    return () => {
      abortRef.current?.abort();
    };
  }, [active]);

  return { activities, loading, error, refresh };
}
