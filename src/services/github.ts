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

export async function fetchOpenPRs(): Promise<{ prs: GitHubPR[]; prComments: GitHubComment[] }> {
  const cacheKey = "github:prs";
  const cached = apiCache.get<{ prs: GitHubPR[]; prComments: GitHubComment[] }>(cacheKey);
  if (cached) return cached;

  const { data } = await withRetry(() => apiClient.get("/github/prs"));
  const result = { prs: data.prs, prComments: data.pr_comments || [] };
  apiCache.set(cacheKey, result);
  return result;
}

export async function fetchReviewRequests(): Promise<GitHubReviewRequest[]> {
  const cacheKey = "github:reviews";
  const cached = apiCache.get<GitHubReviewRequest[]>(cacheKey);
  if (cached) return cached;

  const { data } = await withRetry(() => apiClient.get("/github/reviews"));
  apiCache.set(cacheKey, data.reviews);
  return data.reviews;
}

export async function fetchPRsByDateRange(
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<GitHubPR[]> {
  const cacheKey = `github:prs-by-date:${startDate}:${endDate}`;
  const cached = apiCache.get<GitHubPR[]>(cacheKey);
  if (cached) return cached;

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
  const prs = data.prs || [];
  apiCache.set(cacheKey, prs);
  return prs;
}

export async function fetchCommitCount(
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<number> {
  const cacheKey = `github:commits-count:${startDate}:${endDate}`;
  const cached = apiCache.get<{ commitCount: number }>(cacheKey);
  if (cached) return cached.commitCount;

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
  const count = data.commitCount || 0;
  apiCache.set(cacheKey, { commitCount: count });
  return count;
}

export async function fetchPeerActivity(signal?: AbortSignal): Promise<ActivityItem[]> {
  const cacheKey = "github:peer-activity";
  const cached = apiCache.get<ActivityItem[]>(cacheKey);
  if (cached) return cached;

  const { data } = await withRetry(() => apiClient.get("/github/peer-activity", { signal }));
  const activities = data.activities || [];
  apiCache.set(cacheKey, activities);
  return activities;
}
