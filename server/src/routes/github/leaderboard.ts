import { Router, Request, Response } from "express";
import { createGitHubClient } from "../../clients/githubApiClient";
import { graphql } from "../../clients/githubGraphqlClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import { buildYearChunks } from "./helpers";

const router = Router();
const LONG_CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_BATCH_SIZE = 5;
const MAX_FIELDS_PER_QUERY = 50;
const MAX_CONCURRENT_BATCHES = 3;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 3000;

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
  const users = logins.map((login, i) => {
    const contribs = chunks
      .map(
        (c) => `${c.alias}: contributionsCollection(from: "${c.from}", to: "${c.to}") {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
      }`,
      )
      .join("\n");
    return `u${i}: user(login: "${login}") { login name avatarUrl ${contribs} }`;
  });
  return `query { ${users.join("\n")} }`;
}

function parseUserData(
  userData: Record<string, any>,
  chunks: { alias: string }[],
): LeaderboardEntry {
  let commits = 0,
    prs = 0,
    reviews = 0;
  for (const chunk of chunks) {
    const c = userData[chunk.alias];
    if (!c) continue;
    commits += c.totalCommitContributions || 0;
    prs += c.totalPullRequestContributions || 0;
    reviews += c.totalPullRequestReviewContributions || 0;
  }
  return {
    login: userData.login,
    avatarUrl: userData.avatarUrl,
    name: userData.name,
    commits,
    prs,
    reviews,
  };
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
  logger.info("Leaderboard", `Fetched ${members.length} members for ${org}`);
  return members;
}

router.get("/org-leaderboard", async (req: Request, res: Response) => {
  const { org, startDate, endDate } = req.query as Record<string, string | undefined>;

  if (!org || !startDate || !endDate) {
    return res.status(400).json({ error: "org, startDate, endDate required" });
  }

  const cacheKey = `github:org-leaderboard:${org}:${startDate}:${endDate}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const members = await fetchOrgMembers(org);
    const chunks = buildYearChunks(startDate, endDate);
    const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(MAX_FIELDS_PER_QUERY / chunks.length)));
    const totalBatches = Math.ceil(members.length / batchSize);

    logger.info(
      "Leaderboard",
      `${members.length} members, ${chunks.length} chunks, batch ${batchSize}, ${totalBatches} batches (×${MAX_CONCURRENT_BATCHES})`,
    );

    const fetchBatch = async (index: number): Promise<LeaderboardEntry[]> => {
      const logins = members.slice(index * batchSize, (index + 1) * batchSize);
      const label = `leaderboard/batch-${index + 1}-of-${totalBatches}`;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const data = await graphql<Record<string, any>>(
            buildMemberContributionsQuery(logins, chunks),
            {},
            label,
          );
          return logins.map((_, j) => data[`u${j}`]).filter(Boolean).map((u) => parseUserData(u, chunks));
        } catch (err: any) {
          const status = err?.response?.status;
          const isRetryable = status === 403 || status === 502;
          const isResourceLimit = err?.message?.includes("Resource limits");
          if (isRetryable && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
            logger.warn("Leaderboard", `${label} got ${status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          if (isResourceLimit && logins.length > 1) {
            logger.warn("Leaderboard", `${label} hit resource limit, falling back to single-user queries`);
            const results: LeaderboardEntry[] = [];
            for (const login of logins) {
              try {
                const data = await graphql<Record<string, any>>(
                  buildMemberContributionsQuery([login], chunks),
                  {},
                  `leaderboard/${label}-${login}`,
                );
                const u = data.u0;
                if (u) results.push(parseUserData(u, chunks));
              } catch (e) {
                logger.error("Leaderboard", `${label}-${login} failed: ${e}`);
              }
            }
            return results;
          }
          logger.error("Leaderboard", `${label} failed: ${err}`);
          return [];
        }
      }
      return [];
    };

    const entries: LeaderboardEntry[] = [];
    const indices = Array.from({ length: totalBatches }, (_, i) => i);

    for (let i = 0; i < indices.length; i += MAX_CONCURRENT_BATCHES) {
      const results = await Promise.all(
        indices.slice(i, i + MAX_CONCURRENT_BATCHES).map(fetchBatch),
      );
      entries.push(...results.flat());
      if (i + MAX_CONCURRENT_BATCHES < indices.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const responseData = { members: entries };
    apiCache.set(cacheKey, responseData, new Date(endDate) < new Date() ? LONG_CACHE_TTL : undefined);
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
