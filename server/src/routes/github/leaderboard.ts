import { Router, Request, Response } from "express";
import { createGitHubClient } from "../../clients/githubApiClient";
import { graphql } from "../../clients/githubGraphqlClient";
import { apiCache } from "../../utils/cache";
import { logger } from "../../utils/logger";
import {
  getMonthsBetween,
  getCurrentYearMonth,
  isFullMonth,
  getCachedContributions,
  saveContributions,
  MonthlyContribution,
  getCachedProfiles,
  saveProfiles,
} from "../../services/contributionCache";
import { startPrefetch, isPrefetchRunning } from "../../services/contributionPrefetch";
import { MAX_REPOS_PER_CONTRIBUTION, SHORT_CACHE_TTL, LONG_CACHE_TTL } from "../../utils/constants";

const router = Router();
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

type Totals = Map<string, { commits: number; prs: number; reviews: number }>;

function buildMemberContributionsQuery(
  logins: string[],
  chunks: { from: string; to: string; alias: string }[],
): string {
  const users = logins.map((login, i) => {
    const contribs = chunks
      .map(
        (c) => `${c.alias}: contributionsCollection(from: "${c.from}", to: "${c.to}") {
        commitContributionsByRepository(maxRepositories: ${MAX_REPOS_PER_CONTRIBUTION}) {
          repository { nameWithOwner }
          contributions { totalCount }
        }
        pullRequestContributionsByRepository(maxRepositories: ${MAX_REPOS_PER_CONTRIBUTION}) {
          repository { nameWithOwner }
          contributions { totalCount }
        }
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
  orgPrefix?: string,
): LeaderboardEntry {
  let commits = 0,
    prs = 0,
    reviews = 0;
  for (const chunk of chunks) {
    const c = userData[chunk.alias];
    if (!c) continue;

    const commitRepos = c.commitContributionsByRepository || [];
    if (commitRepos.length >= MAX_REPOS_PER_CONTRIBUTION) {
      logger.warn("Leaderboard", `${userData.login} hit ${MAX_REPOS_PER_CONTRIBUTION} repo cap for commits in ${chunk.alias}, counts may be incomplete`);
    }
    for (const repo of commitRepos) {
      if (orgPrefix && !repo.repository.nameWithOwner.startsWith(orgPrefix)) continue;
      commits += repo.contributions.totalCount || 0;
    }

    const prRepos = c.pullRequestContributionsByRepository || [];
    if (prRepos.length >= MAX_REPOS_PER_CONTRIBUTION) {
      logger.warn("Leaderboard", `${userData.login} hit ${MAX_REPOS_PER_CONTRIBUTION} repo cap for PRs in ${chunk.alias}, counts may be incomplete`);
    }
    for (const repo of prRepos) {
      if (orgPrefix && !repo.repository.nameWithOwner.startsWith(orgPrefix)) continue;
      prs += repo.contributions.totalCount || 0;
    }

    reviews += c.totalPullRequestReviewContributions || 0;
  }
  return { login: userData.login, avatarUrl: userData.avatarUrl, name: userData.name, commits, prs, reviews };
}

function addToTotals(totals: Totals, results: LeaderboardEntry[]): void {
  for (const r of results) {
    const t = totals.get(r.login);
    if (t) {
      t.commits += r.commits;
      t.prs += r.prs;
      t.reviews += r.reviews;
    }
  }
}

function monthToChunk(month: string): { from: string; to: string; alias: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${month}-01T00:00:00Z`,
    to: `${month}-${lastDay.toString().padStart(2, "0")}T23:59:59Z`,
    alias: "c0",
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
    const { data } = await github.get(`/orgs/${org}/members`, { params: { per_page: 100, page } });
    members.push(...data.map((m: any) => m.login));
    if (data.length < 100) break;
    page++;
  }

  apiCache.set(cacheKey, members, LONG_CACHE_TTL);
  logger.info("Leaderboard", `Fetched ${members.length} members for ${org}`);
  return members;
}

async function fetchBatchFromApi(
  members: string[],
  chunks: { from: string; to: string; alias: string }[],
  batchSize: number,
  label: string,
  orgPrefix?: string,
): Promise<LeaderboardEntry[]> {
  const totalBatches = Math.ceil(members.length / batchSize);

  const fetchOne = async (index: number): Promise<LeaderboardEntry[]> => {
    const logins = members.slice(index * batchSize, (index + 1) * batchSize);
    const tag = `${label}/batch-${index + 1}-of-${totalBatches}`;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await graphql<Record<string, any>>(buildMemberContributionsQuery(logins, chunks), {}, tag);
        return logins.map((_, j) => data[`u${j}`]).filter(Boolean).map((u) => parseUserData(u, chunks, orgPrefix));
      } catch (err: any) {
        const status = err?.response?.status;
        if ((status === 403 || status === 502) && attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
          logger.warn("Leaderboard", `${tag} got ${status}, retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        if (err?.message?.includes("Resource limits") && logins.length > 1) {
          logger.warn("Leaderboard", `${tag} resource limit, falling back to single-user`);
          const results: LeaderboardEntry[] = [];
          for (const login of logins) {
            try {
              const d = await graphql<Record<string, any>>(buildMemberContributionsQuery([login], chunks), {}, `${tag}-${login}`);
              if (d.u0) results.push(parseUserData(d.u0, chunks));
            } catch (e) {
              logger.error("Leaderboard", `${tag}-${login} failed: ${e}`);
            }
          }
          return results;
        }
        logger.error("Leaderboard", `${tag} failed: ${err}`);
        return [];
      }
    }
    return [];
  };

  const entries: LeaderboardEntry[] = [];
  const indices = Array.from({ length: totalBatches }, (_, i) => i);
  for (let i = 0; i < indices.length; i += MAX_CONCURRENT_BATCHES) {
    const results = await Promise.all(indices.slice(i, i + MAX_CONCURRENT_BATCHES).map(fetchOne));
    entries.push(...results.flat());
    if (i + MAX_CONCURRENT_BATCHES < indices.length) await new Promise((r) => setTimeout(r, 500));
  }
  saveProfiles(entries.map((e) => ({ login: e.login, name: e.name, avatarUrl: e.avatarUrl })));
  return entries;
}

function loadProfiles(members: string[]): Map<string, { avatarUrl: string; name: string | null }> {
  const cached = getCachedProfiles(members);
  const profiles = new Map<string, { avatarUrl: string; name: string | null }>();
  for (const [login, p] of cached) {
    profiles.set(login, { avatarUrl: p.avatarUrl, name: p.name });
  }
  logger.info("Leaderboard", `Profiles: ${cached.size}/${members.length} from cache`);
  return profiles;
}

function triggerPrefetch(org: string): void {
  if (isPrefetchRunning()) return;
  fetchOrgMembers(org)
    .then((members) => startPrefetch(org, members))
    .catch((err) => logger.error("Prefetch", `Failed: ${err}`));
}

router.get("/org-leaderboard", async (req: Request, res: Response) => {
  const { org, startDate, endDate } = req.query as Record<string, string | undefined>;
  if (!org || !startDate || !endDate) {
    return res.status(400).json({ error: "org, startDate, endDate required" });
  }

  const cacheKey = `github:org-leaderboard:${org}:${startDate}:${endDate}`;
  const cached = apiCache.get(cacheKey);
  if (cached) {
    triggerPrefetch(org);
    return res.json(cached);
  }

  try {
    const members = await fetchOrgMembers(org);
    const today = new Date().toISOString().split("T")[0];
    const effectiveEnd = endDate > today ? today : endDate;
    const currentMonth = getCurrentYearMonth();
    const allMonths = getMonthsBetween(startDate, effectiveEnd);
    const fullMonths = allMonths.filter((m) => m !== currentMonth && isFullMonth(startDate, effectiveEnd, m));
    const partialMonths = allMonths.filter((m) => !fullMonths.includes(m));

    const dbCache = getCachedContributions(org, members, fullMonths);

    const missingByMonth = new Map<string, string[]>();
    for (const month of fullMonths) {
      const needing = members.filter((l) => !dbCache.get(l)?.has(month));
      if (needing.length > 0) missingByMonth.set(month, needing);
    }

    const cachedPairs = members.length * fullMonths.length - Array.from(missingByMonth.values()).reduce((s, m) => s + m.length, 0);
    logger.info(
      "Leaderboard",
      `${org}: ${members.length} members, ${allMonths.length} months (${fullMonths.length} full, ${partialMonths.length} partial), cache ${cachedPairs}/${members.length * fullMonths.length}`,
    );

    const totals: Totals = new Map(members.map((l) => [l, { commits: 0, prs: 0, reviews: 0 }]));

    for (const [, monthMap] of dbCache) {
      for (const contrib of monthMap.values()) {
        const t = totals.get(contrib.login);
        if (t) { t.commits += contrib.commits; t.prs += contrib.prs; t.reviews += contrib.reviews; }
      }
    }

    for (const [month, logins] of missingByMonth) {
      const chunk = monthToChunk(month);
      const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(MAX_FIELDS_PER_QUERY)));
      const results = await fetchBatchFromApi(logins, [chunk], batchSize, `leaderboard/${month}`, `${org}/`);
      saveContributions(org, results.map((r) => ({ login: r.login, yearMonth: month, commits: r.commits, prs: r.prs, reviews: r.reviews })));
      addToTotals(totals, results);
    }

    if (partialMonths.length > 0) {
      const currentMonthPartials = partialMonths.filter((m) => m === currentMonth);
      const otherPartials = partialMonths.filter((m) => m !== currentMonth);

      for (const month of currentMonthPartials) {
        const cmKey = `leaderboard:current:${org}:${month}:${startDate}:${effectiveEnd}`;
        const cmCached = apiCache.get<LeaderboardEntry[]>(cmKey);
        if (cmCached) {
          logger.info("Leaderboard", `Current month ${month} from cache`);
          addToTotals(totals, cmCached);
        } else {
          const [y, m] = month.split("-").map(Number);
          const first = month === allMonths[0] ? startDate : `${month}-01`;
          const last = month === allMonths[allMonths.length - 1] ? effectiveEnd : `${month}-${new Date(y, m, 0).getDate().toString().padStart(2, "0")}`;
          const chunks = [{ from: `${first}T00:00:00Z`, to: `${last}T23:59:59Z`, alias: "p0" }];
          const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(MAX_FIELDS_PER_QUERY)));
          const results = await fetchBatchFromApi(members, chunks, batchSize, `leaderboard/current`, `${org}/`);
          apiCache.set(cmKey, results, SHORT_CACHE_TTL);
          addToTotals(totals, results);
        }
      }

      if (otherPartials.length > 0) {
        const chunks = otherPartials.map((month, i) => {
          const [y, m] = month.split("-").map(Number);
          const first = month === allMonths[0] ? startDate : `${month}-01`;
          const last = month === allMonths[allMonths.length - 1] ? effectiveEnd : `${month}-${new Date(y, m, 0).getDate().toString().padStart(2, "0")}`;
          return { from: `${first}T00:00:00Z`, to: `${last}T23:59:59Z`, alias: `p${i}` };
        });
        const batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(MAX_FIELDS_PER_QUERY / chunks.length)));
        addToTotals(totals, await fetchBatchFromApi(members, chunks, batchSize, "leaderboard/partial", `${org}/`));
      }
    }

    const profiles = loadProfiles(members);
    const entries: LeaderboardEntry[] = members.map((login) => {
      const t = totals.get(login) || { commits: 0, prs: 0, reviews: 0 };
      const p = profiles.get(login) || { avatarUrl: `https://github.com/${login}.png`, name: null };
      return { login, avatarUrl: p.avatarUrl, name: p.name, ...t };
    });

    const responseData = { members: entries };
    apiCache.set(cacheKey, responseData, new Date(effectiveEnd) < new Date() ? LONG_CACHE_TTL : undefined);
    logger.info("Leaderboard", `${entries.length} members for ${org} (${startDate} to ${effectiveEnd})`);
    res.json(responseData);

    triggerPrefetch(org);
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
