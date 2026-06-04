import { Router, Request, Response } from "express";
import { getConfig } from "../../config";
import { createGitHubClient } from "../../clients/githubApiClient";
import { graphql } from "../../clients/githubGraphqlClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import { buildYearChunks } from "./helpers";

const router = Router();
const LONG_CACHE_TTL = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5;

interface LeaderboardEntry {
  login: string;
  avatarUrl: string;
  name: string | null;
  commits: number;
  prs: number;
  reviews: number;
}

function buildMemberContributionsQuery(
  logins: string[],
  chunks: { from: string; to: string; alias: string }[],
): string {
  const userFragments = logins.map((login, i) => {
    const contribFragments = chunks.map(
      (c) => `${c.alias}: contributionsCollection(from: "${c.from}", to: "${c.to}") {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
      }`,
    );
    return `u${i}: user(login: "${login}") {
      login
      name
      avatarUrl
      ${contribFragments.join("\n")}
    }`;
  });
  return `query { ${userFragments.join("\n")} }`;
}

async function fetchOrgMembers(org: string): Promise<string[]> {
  const cacheKey = `github:org-members:${org}`;
  const cached = apiCache.get<string[]>(cacheKey);
  if (cached) return cached;

  const github = createGitHubClient();
  const members: string[] = [];
  let page = 1;

  while (true) {
    const { data } = await github.get(`/orgs/${org}/members`, {
      params: { per_page: 100, page },
    });
    members.push(...data.map((m: any) => m.login));
    if (data.length < 100) break;
    page++;
  }

  apiCache.set(cacheKey, members, LONG_CACHE_TTL);
  logger.info("Leaderboard", `Fetched ${members.length} members for org ${org}`);
  return members;
}

router.get("/org-leaderboard", async (req: Request, res: Response) => {
  const { org, startDate, endDate } = req.query as {
    org?: string;
    startDate?: string;
    endDate?: string;
  };

  if (!org || !startDate || !endDate) {
    return res.status(400).json({ error: "org, startDate, endDate required" });
  }

  const cacheKey = `github:org-leaderboard:${org}:${startDate}:${endDate}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const members = await fetchOrgMembers(org);
    const chunks = buildYearChunks(startDate, endDate);
    const entries: LeaderboardEntry[] = [];

    for (let i = 0; i < members.length; i += BATCH_SIZE) {
      const batch = members.slice(i, i + BATCH_SIZE);
      const query = buildMemberContributionsQuery(batch, chunks);

      try {
        const data = await graphql<Record<string, any>>(
          query,
          {},
          `leaderboard/batch-${Math.floor(i / BATCH_SIZE)}`,
        );

        for (let j = 0; j < batch.length; j++) {
          const userData = data[`u${j}`];
          if (!userData) continue;

          let commits = 0;
          let prs = 0;
          let reviews = 0;

          for (const chunk of chunks) {
            const contrib = userData[chunk.alias];
            if (!contrib) continue;
            commits += contrib.totalCommitContributions || 0;
            prs += contrib.totalPullRequestContributions || 0;
            reviews += contrib.totalPullRequestReviewContributions || 0;
          }

          entries.push({
            login: userData.login,
            avatarUrl: userData.avatarUrl,
            name: userData.name,
            commits,
            prs,
            reviews,
          });
        }
      } catch (err) {
        logger.error("Leaderboard", `Batch ${i / BATCH_SIZE} failed: ${err}`);
      }
    }

    const isPast = new Date(endDate) < new Date();
    const responseData = { members: entries };
    apiCache.set(cacheKey, responseData, isPast ? LONG_CACHE_TTL : undefined);
    logger.info("Leaderboard", `${entries.length} members for ${org} (${startDate} to ${endDate})`);
    res.json(responseData);
  } catch (err) {
    logger.error("Leaderboard", `Failed: ${err}`);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.get("/user-orgs", async (_req: Request, res: Response) => {
  const cacheKey = "github:user-orgs";
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const github = createGitHubClient();
    const { data } = await github.get("/user/orgs", { params: { per_page: 100 } });
    const orgs = data.map((o: any) => ({ login: o.login, avatarUrl: o.avatar_url }));
    const responseData = { orgs };
    apiCache.set(cacheKey, responseData, LONG_CACHE_TTL);
    res.json(responseData);
  } catch (err) {
    logger.error("UserOrgs", `Failed: ${err}`);
    res.status(500).json({ error: "Failed to fetch user orgs" });
  }
});

export default router;
