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
  getCachedProfiles,
  saveProfiles,
} from "../../services/contributionCache";
import {
  startPrefetch,
  isPrefetchRunning,
  registerLeaderboardCheck,
  getPrefetchStatus,
} from "../../services/contributionPrefetch";
import { SHORT_CACHE_TTL, LONG_CACHE_TTL } from "../../utils/constants";

const router = Router();
const MAX_BATCH_SIZE = 35;
const MAX_CONCURRENT_BATCHES = 2;
const MAX_RETRIES = 3;
const FALLBACK_403_PAUSE_MS = 5000;
const FALLBACK_403_PARALLEL = 5;

let activeLeaderboardRequests = 0;

export function isLeaderboardActive(): boolean {
  return activeLeaderboardRequests > 0;
}

registerLeaderboardCheck(isLeaderboardActive);

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
): { query: string; variables: Record<string, string> } {
  const variables: Record<string, string> = {};
  const varDefs: string[] = ["$orgId: ID!"];

  chunks.forEach((c, ci) => {
    varDefs.push(`$from${ci}: DateTime!`, `$to${ci}: DateTime!`);
    variables[`from${ci}`] = c.from;
    variables[`to${ci}`] = c.to;
  });

  const users = logins.map((login, i) => {
    const varName = `$l${i}`;
    varDefs.push(`${varName}: String!`);
    variables[`l${i}`] = login;
    const contribs = chunks
      .map(
        (
          c,
          ci,
        ) => `${c.alias}: contributionsCollection(from: $from${ci}, to: $to${ci}, organizationID: $orgId) {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
      }`,
      )
      .join("\n");
    return `u${i}: user(login: ${varName}) { login name avatarUrl ${contribs} }`;
  });

  const query = `query(${varDefs.join(", ")}) { ${users.join("\n")} }`;
  return { query, variables };
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

async function fetchOrgId(org: string): Promise<string> {
  const data = await graphql<{ organization: { id: string } }>(
    `
      query ($org: String!) {
        organization(login: $org) {
          id
        }
      }
    `,
    { org },
  );
  return data.organization.id;
}

export async function fetchOrgMembers(org: string): Promise<string[]> {
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

interface BatchResult {
  entries: LeaderboardEntry[];
  hasErrors: boolean;
}

async function fetchBatchFromApi(
  members: string[],
  chunks: { from: string; to: string; alias: string }[],
  batchSize: number,
  label: string,
  orgId: string,
  signal?: AbortSignal,
): Promise<BatchResult> {
  const totalBatches = Math.ceil(members.length / batchSize);
  let hasErrors = false;

  const fetchOne = async (index: number): Promise<LeaderboardEntry[]> => {
    const logins = members.slice(index * batchSize, (index + 1) * batchSize);
    const tag = `${label}/batch-${index + 1}-of-${totalBatches}`;

    const tryBatch = async (users: string[], subTag: string): Promise<LeaderboardEntry[]> => {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const { query, variables } = buildMemberContributionsQuery(users, chunks);
          const data = await graphql<Record<string, any>>(query, { ...variables, orgId }, subTag);
          return users
            .map((_, j) => data[`u${j}`])
            .filter(Boolean)
            .map((u) => parseUserData(u, chunks));
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 403) {
            if (users.length > 1) {
              logger.warn(
                "Leaderboard",
                `${subTag} got 403, pausing ${FALLBACK_403_PAUSE_MS}ms then falling back to parallel single-user`,
              );
              await new Promise((r) => setTimeout(r, FALLBACK_403_PAUSE_MS));
              return await fallbackToSingles(users, subTag);
            }
            logger.warn("Leaderboard", `${subTag} skipped (403)`);
            return users.map((login) => ({ login, commits: 0, prs: 0, reviews: 0 }));
          }
          if (err?.message?.includes("Resource limits") && users.length > 5) {
            logger.warn(
              "Leaderboard",
              `${subTag} resource limit, splitting batch (${users.length} → ${Math.floor(users.length / 2)})`,
            );
            const mid = Math.floor(users.length / 2);
            const [a, b] = await Promise.all([
              tryBatch(users.slice(0, mid), `${subTag}-split1`),
              tryBatch(users.slice(mid), `${subTag}-split2`),
            ]);
            return [...a, ...b];
          }
          if (err?.message?.includes("Resource limits") && users.length <= 5) {
            logger.warn(
              "Leaderboard",
              `${subTag} resource limit (small batch), falling back to parallel single-user`,
            );
            return await fallbackToSingles(users, subTag);
          }
          logger.error("Leaderboard", `${subTag} failed: ${err}`);
          hasErrors = true;
          return [];
        }
      }
      hasErrors = true;
      return [];
    };

    const fallbackToSingles = async (
      users: string[],
      baseTag: string,
    ): Promise<LeaderboardEntry[]> => {
      const results: LeaderboardEntry[] = [];
      for (let i = 0; i < users.length; i += FALLBACK_403_PARALLEL) {
        const batch = users.slice(i, i + FALLBACK_403_PARALLEL);
        const batchResults = await Promise.all(
          batch.map(async (login) => {
            try {
              const { query: q, variables: v } = buildMemberContributionsQuery([login], chunks);
              const d = await graphql<Record<string, any>>(
                q,
                { ...v, orgId },
                `${baseTag}-${login}`,
              );
              return d.u0 ? parseUserData(d.u0, chunks) : null;
            } catch (e: any) {
              if (e?.response?.status === 403) {
                logger.warn("Leaderboard", `${baseTag}-${login} skipped (403)`);
                return { login, commits: 0, prs: 0, reviews: 0 };
              }
              logger.error("Leaderboard", `${baseTag}-${login} failed: ${e}`);
              return null;
            }
          }),
        );
        results.push(...(batchResults.filter(Boolean) as LeaderboardEntry[]));
      }
      return results;
    };

    return tryBatch(logins, tag);
  };

  const entries: LeaderboardEntry[] = [];
  const indices = Array.from({ length: totalBatches }, (_, i) => i);
  for (let i = 0; i < indices.length; i += MAX_CONCURRENT_BATCHES) {
    if (signal?.aborted) break;
    const results = await Promise.all(indices.slice(i, i + MAX_CONCURRENT_BATCHES).map(fetchOne));
    entries.push(...results.flat());
  }
  saveProfiles(entries.map((e) => ({ login: e.login, name: e.name, avatarUrl: e.avatarUrl })));
  return { entries, hasErrors };
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

router.get("/org-leaderboard", async (req: Request, res: Response) => {
  const { org, startDate, endDate } = req.query as Record<string, string | undefined>;
  if (!org || !startDate || !endDate) {
    return res.status(400).json({ error: "org, startDate, endDate required" });
  }

  const today = new Date().toISOString().split("T")[0];
  const effectiveEnd = endDate > today ? today : endDate;
  const cacheKey = `github:org-leaderboard:${org}:${startDate}:${effectiveEnd}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);

  const abort = new AbortController();
  req.on("close", () => abort.abort());

  activeLeaderboardRequests++;
  try {
    const orgId = await fetchOrgId(org);
    const members = await fetchOrgMembers(org);
    const currentMonth = getCurrentYearMonth();
    const allMonths = getMonthsBetween(startDate, effectiveEnd);
    const fullMonths = allMonths.filter(
      (m) => m !== currentMonth && isFullMonth(startDate, effectiveEnd, m),
    );
    const partialMonths = allMonths.filter((m) => !fullMonths.includes(m));

    const dbCache = getCachedContributions(org, members, fullMonths);

    const missingByMonth = new Map<string, string[]>();
    for (const month of fullMonths) {
      const needing = members.filter((l) => !dbCache.get(l)?.has(month));
      if (needing.length > 0) missingByMonth.set(month, needing);
    }

    const cachedPairs =
      members.length * fullMonths.length -
      Array.from(missingByMonth.values()).reduce((s, m) => s + m.length, 0);
    logger.info(
      "Leaderboard",
      `${org}: ${members.length} members, ${allMonths.length} months (${fullMonths.length} full, ${partialMonths.length} partial), cache ${cachedPairs}/${members.length * fullMonths.length}`,
    );

    const totals: Totals = new Map(members.map((l) => [l, { commits: 0, prs: 0, reviews: 0 }]));
    let fetchHasErrors = false;

    for (const [, monthMap] of dbCache) {
      for (const contrib of monthMap.values()) {
        const t = totals.get(contrib.login);
        if (t) {
          t.commits += contrib.commits;
          t.prs += contrib.prs;
          t.reviews += contrib.reviews;
        }
      }
    }

    const missingEntries = Array.from(missingByMonth.entries());
    for (let i = 0; i < missingEntries.length; i += MAX_CONCURRENT_BATCHES) {
      if (abort.signal.aborted) break;
      const slice = missingEntries.slice(i, i + MAX_CONCURRENT_BATCHES);
      const results = await Promise.all(
        slice.map(([month, logins]) => {
          const chunk = monthToChunk(month);
          return fetchBatchFromApi(
            logins,
            [chunk],
            MAX_BATCH_SIZE,
            `leaderboard/${month}`,
            orgId,
            abort.signal,
          ).then((batch) => ({ month, batch }));
        }),
      );
      for (const { month, batch } of results) {
        fetchHasErrors ||= batch.hasErrors;
        saveContributions(
          org,
          batch.entries.map((r) => ({
            login: r.login,
            yearMonth: month,
            commits: r.commits,
            prs: r.prs,
            reviews: r.reviews,
          })),
        );
        addToTotals(totals, batch.entries);
      }
    }

    if (partialMonths.length > 0) {
      const currentMonthPartials = partialMonths.filter((m) => m === currentMonth);
      const otherPartials = partialMonths.filter((m) => m !== currentMonth);

      const monthToChunkRange = (month: string, alias: string) => {
        const [y, m] = month.split("-").map(Number);
        const first = month === allMonths[0] ? startDate : `${month}-01`;
        const last =
          month === allMonths[allMonths.length - 1]
            ? effectiveEnd
            : `${month}-${new Date(y, m, 0).getDate().toString().padStart(2, "0")}`;
        return { from: `${first}T00:00:00Z`, to: `${last}T23:59:59Z`, alias };
      };

      for (const month of currentMonthPartials) {
        const partialChunk = monthToChunkRange(month, "p0");
        const cmKey = `leaderboard:current:${org}:${partialChunk.from}:${partialChunk.to}`;
        const cmCached = apiCache.get<LeaderboardEntry[]>(cmKey);
        if (cmCached) {
          logger.info("Leaderboard", `Current month ${month} from cache`);
          addToTotals(totals, cmCached);
        } else {
          const batch = await fetchBatchFromApi(
            members,
            [partialChunk],
            MAX_BATCH_SIZE,
            `leaderboard/current`,
            orgId,
            abort.signal,
          );
          fetchHasErrors ||= batch.hasErrors;
          if (!batch.hasErrors) apiCache.set(cmKey, batch.entries, SHORT_CACHE_TTL);
          addToTotals(totals, batch.entries);
        }
      }

      if (otherPartials.length > 0) {
        const chunks = otherPartials.map((month, i) => monthToChunkRange(month, `p${i}`));
        const batch = await fetchBatchFromApi(
          members,
          chunks,
          MAX_BATCH_SIZE,
          "leaderboard/partial",
          orgId,
          abort.signal,
        );
        fetchHasErrors ||= batch.hasErrors;
        addToTotals(totals, batch.entries);
      }
    }

    if (abort.signal.aborted) {
      logger.info("Leaderboard", `Request cancelled for ${org} (${startDate} to ${effectiveEnd})`);
      return;
    }

    const profiles = loadProfiles(members);
    const entries: LeaderboardEntry[] = members.map((login) => {
      const t = totals.get(login) || { commits: 0, prs: 0, reviews: 0 };
      const p = profiles.get(login) || { avatarUrl: `https://github.com/${login}.png`, name: null };
      return { login, avatarUrl: p.avatarUrl, name: p.name, ...t };
    });

    const responseData = { members: entries };
    if (!fetchHasErrors) {
      apiCache.set(
        cacheKey,
        responseData,
        new Date(effectiveEnd) < new Date() ? LONG_CACHE_TTL : undefined,
      );
    }
    logger.info(
      "Leaderboard",
      `${entries.length} members for ${org} (${startDate} to ${effectiveEnd})`,
    );
    res.json(responseData);

    if (!isPrefetchRunning()) {
      fetchOrgMembers(org)
        .then((m) => startPrefetch(org, m))
        .catch((err) => logger.error("Prefetch", `Failed: ${err}`));
    }
  } catch (err) {
    logger.error("Leaderboard", `Failed: ${err}`);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  } finally {
    activeLeaderboardRequests--;
  }
});

router.get("/prefetch-status", (_req: Request, res: Response) => {
  res.json(getPrefetchStatus());
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
