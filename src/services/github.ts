import { GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { apiClient } from "./config";
import { apiCache } from "../utils/cache";

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

  const { data } = await apiClient.get("/github/dashboard");
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

  const { data } = await apiClient.get("/github/prs");
  const result = { prs: data.prs, prComments: data.pr_comments || [] };
  apiCache.set(cacheKey, result);
  return result;
}

export async function fetchReviewRequests(): Promise<GitHubReviewRequest[]> {
  const cacheKey = "github:reviews";
  const cached = apiCache.get<GitHubReviewRequest[]>(cacheKey);
  if (cached) return cached;

  const { data } = await apiClient.get("/github/reviews");
  apiCache.set(cacheKey, data.reviews);
  return data.reviews;
}

export async function fetchMentions(): Promise<GitHubComment[]> {
  const cacheKey = "github:mentions";
  const cached = apiCache.get<GitHubComment[]>(cacheKey);
  if (cached) return cached;

  const { data } = await apiClient.get("/github/mentions");
  apiCache.set(cacheKey, data.mentions);
  return data.mentions;
}

export async function fetchPRsByDateRange(startDate: string, endDate: string): Promise<GitHubPR[]> {
  const cacheKey = `github:prs-by-date:${startDate}:${endDate}`;
  const cached = apiCache.get<GitHubPR[]>(cacheKey);
  if (cached) return cached;

  const { data } = await apiClient.get("/github/prs-by-date-range", {
    params: { startDate, endDate },
  });
  apiCache.set(cacheKey, data.prs);
  return data.prs;
}
