import { useState, useEffect, useCallback } from "react";
import { ActivityCount, fetchActivityCount } from "../services/activity";

const REFETCH_INTERVAL = 3_000;

export function useActivityCount(active: boolean) {
  const [counts, setCounts] = useState<ActivityCount>({ github: 0, jira: 0, total: 0 });

  const fetch = useCallback(() => {
    fetchActivityCount()
      .then(setCounts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) return;
    fetch();
    const id = setInterval(fetch, REFETCH_INTERVAL);
    return () => clearInterval(id);
  }, [active, fetch]);

  return counts;
}
