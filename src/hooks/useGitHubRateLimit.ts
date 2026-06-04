import { useState, useEffect } from "react";
import { apiClient } from "../services/config";

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  resetAt: string;
}

export function useGitHubRateLimit(configured: boolean) {
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;

    const fetchRateLimit = async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get<{ rateLimit: RateLimitStatus | null }>(
          "/github/rate-limit",
        );
        setRateLimit(data.rateLimit);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch rate limit");
      } finally {
        setLoading(false);
      }
    };

    fetchRateLimit();
    const interval = setInterval(fetchRateLimit, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [configured]);

  return { rateLimit, loading, error };
}
