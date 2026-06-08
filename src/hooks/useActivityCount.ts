import { useState, useEffect } from "react";
import { ActivityCount, fetchActivityCount } from "../services/activity";

export function useActivityCount(active: boolean) {
  const [counts, setCounts] = useState<ActivityCount>({ github: 0, jira: 0, total: 0 });

  useEffect(() => {
    if (!active) return;
    fetchActivityCount()
      .then(setCounts)
      .catch(() => {});
  }, [active]);

  return counts;
}
