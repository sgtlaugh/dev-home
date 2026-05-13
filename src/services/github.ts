import { GitHubPR, GitHubComment, GitHubReviewRequest } from "../types";
import { apiClient } from "./config";

export async function fetchOpenPRs(): Promise<{ prs: GitHubPR[]; prComments: GitHubComment[] }> {
  const { data } = await apiClient.get("/github/prs");
  return { prs: data.prs, prComments: data.pr_comments || [] };
}

export async function fetchReviewRequests(): Promise<GitHubReviewRequest[]> {
  const { data } = await apiClient.get("/github/reviews");
  return data.reviews;
}

export async function fetchMentions(): Promise<GitHubComment[]> {
  const { data } = await apiClient.get("/github/mentions");
  return data.mentions;
}

export async function fetchPRsByMonth(year: number, month: number): Promise<GitHubPR[]> {
  const { data } = await apiClient.get("/github/prs-by-month", {
    params: { year, month },
  });
  return data.prs;
}
