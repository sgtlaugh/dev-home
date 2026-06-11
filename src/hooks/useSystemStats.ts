import { useState, useEffect } from "react";
import { SystemStats, fetchSystemStats } from "../services/system";

const POLL_INTERVAL = 30_000;

export function useSystemStats(active: boolean) {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    if (!active) return;

    let mounted = true;
    const load = () => {
      fetchSystemStats()
        .then((data) => mounted && setStats(data))
        .catch(() => {});
    };

    load();
    const id = setInterval(load, POLL_INTERVAL);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [active]);

  return stats;
}
