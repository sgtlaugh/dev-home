import { GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { ActivityItem } from "./activity";
import { apiClient } from "./config";
import { apiCache } from "../utils/cache";
import { withRetry } from "../utils/retry";

export async function fetchDashboard(): Promise<{
  prs: GitHubPR[];
  prComments: GitHubComment[];
  reviews: GitHubReviewRequest[];
}> {
  const cacheKey = "github:dashboard";
  const cached = apiCache.get<{
    prs: GitHubPR[];
    prComments: GitHubComment[];
    reviews: GitHubReviewRequest[];
  }>(cacheKey);
  if (cached) return cached;

  const { data } = await withRetry(() => apiClient.get("/github/dashboard"));
  const result = {
    prs: data.prs,
    prComments: data.pr_comments || [],
    reviews: data.reviews,
  };
  apiCache.set(cacheKey, result);
  return result;
}

const SYNC_RETRY_DELAY_MS = 3000;
const SYNC_MAX_RETRIES = 30;

export async function fetchPRsByDateRange(
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<GitHubPR[]> {
  const cacheKey = `github:prs-by-date:${startDate}:${endDate}`;
  const cached = apiCache.get<GitHubPR[]>(cacheKey);
  if (cached) return cached;

  for (let attempt = 0; attempt < SYNC_MAX_RETRIES; attempt++) {
    const { data } = await withRetry(
      () =>
        apiClient.get("/github/prs-by-date-range", {
          params: { startDate, endDate },
          signal,
        }),
      3,
      1000,
      signal,
    );

    if (!data.syncPending) {
      const prs = data.prs || [];
      apiCache.set(cacheKey, prs);
      return prs;
    }

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
      const timer = setTimeout(resolve, SYNC_RETRY_DELAY_MS);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }

  return [];
}

export interface ContributionStats {
  commitCount: number;
  reviewCount: number;
}

export async function fetchContributionStats(
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<ContributionStats> {
  const cacheKey = `github:contrib-stats:${startDate}:${endDate}`;
  const cached = apiCache.get<ContributionStats>(cacheKey);
  if (cached) return cached;

  const { data } = await withRetry(
    () =>
      apiClient.get("/github/commits-search", {
        params: { startDate, endDate },
        signal,
      }),
    3,
    1000,
    signal,
  );
  const stats: ContributionStats = {
    commitCount: data.commitCount || 0,
    reviewCount: data.reviewCount || 0,
  };
  apiCache.set(cacheKey, stats);
  return stats;
}

export async function fetchUserJoinDate(signal?: AbortSignal): Promise<string> {
  const cacheKey = "github:user-join-date";
  const cached = apiCache.get<string>(cacheKey);
  if (cached) return cached;

  const { data } = await apiClient.get("/github/user-info", { signal });
  const date = data.createdAt?.slice(0, 10) || "";
  apiCache.set(cacheKey, date);
  return date;
}

export async function fetchTeamActivity(signal?: AbortSignal): Promise<ActivityItem[]> {
  const cacheKey = "github:team-activity";
  const cached = apiCache.get<ActivityItem[]>(cacheKey);
  if (cached) return cached;

  const { data } = await withRetry(() => apiClient.get("/github/team-activity", { signal }));
  const activities = data.activities || [];
  apiCache.set(cacheKey, activities);
  return activities;
}
