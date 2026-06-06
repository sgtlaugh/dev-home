import { graphql } from "../clients/githubGraphqlClient";
import { createGitHubClient } from "../clients/githubApiClient";
import { apiCache } from "../utils/cache";
import { LONG_CACHE_TTL } from "../utils/constants";
import { logger } from "../utils/logger";
import {
  getMonthsBetween,
  getCurrentYearMonth,
  getCachedLoginsForMonth,
  saveContributions,
  saveProfiles,
  MonthlyContribution,
} from "./contributionCache";

const BATCH_SIZE = 35;
const BATCH_DELAY_MS = 2000;

let prefetchRunning = false;
let isLeaderboardActiveFn: (() => boolean) | null = null;

let progress = { queriesDone: 0, totalQueries: 0, org: "", completedAt: 0 };

export interface PrefetchStatus {
  running: boolean;
  queriesDone: number;
  totalQueries: number;
  org: string;
  completedAt: number;
}

export function getPrefetchStatus(): PrefetchStatus {
  return { running: prefetchRunning, ...progress };
}

export function registerLeaderboardCheck(fn: () => boolean): void {
  isLeaderboardActiveFn = fn;
}

function buildMonthQuery(logins: string[], yearMonth: string, orgId: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${yearMonth}-01T00:00:00Z`;
  const to = `${yearMonth}-${lastDay.toString().padStart(2, "0")}T23:59:59Z`;

  const users = logins.map(
    (login, i) =>
      `u${i}: user(login: "${login}") {
        login name avatarUrl
        c: contributionsCollection(from: "${from}", to: "${to}", organizationID: "${orgId}") {
          totalCommitContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
        }
      }`,
  );
  return `query { ${users.join("\n")} }`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h${m}m`;
}

async function getOrgCreatedMonth(org: string): Promise<string> {
  const cacheKey = `github:org-created:${org}`;
  const cached = apiCache.get<string>(cacheKey);
  if (cached) return cached;

  try {
    const github = createGitHubClient();
    const { data } = await github.get(`/orgs/${org}`);
    const created = new Date(data.created_at);
    const month = `${created.getFullYear()}-${(created.getMonth() + 1).toString().padStart(2, "0")}`;
    apiCache.set(cacheKey, month, LONG_CACHE_TTL);
    logger.info("Prefetch", `${org} created ${month}`);
    return month;
  } catch {
    return "2008-01";
  }
}

async function waitForLeaderboard(): Promise<void> {
  if (!isLeaderboardActiveFn) return;
  while (isLeaderboardActiveFn()) {
    logger.info("Prefetch", "Paused - leaderboard query active");
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export function isPrefetchRunning(): boolean {
  return prefetchRunning;
}

export async function startPrefetch(
  org: string,
  members: string[],
): Promise<void> {
  if (prefetchRunning) {
    logger.info("Prefetch", "Already running, skipping");
    return;
  }

  prefetchRunning = true;
  const currentMonth = getCurrentYearMonth();

  try {
    await waitForLeaderboard();

    const data = await graphql<{ organization: { id: string } }>(`query { organization(login: "${org}") { id } }`);
    const orgId = data.organization.id;

    const startYearMonth = await getOrgCreatedMonth(org);
    const allMonths = getMonthsBetween(`${startYearMonth}-01`, `${currentMonth}-28`);
    const monthsToProcess = allMonths.filter((m) => m !== currentMonth).reverse();

    const monthWork: { month: string; missing: string[] }[] = [];
    const cachedMonthsList: string[] = [];

    for (const month of monthsToProcess) {
      const cachedLogins = getCachedLoginsForMonth(org, month);
      const missing = members.filter((l) => !cachedLogins.has(l));
      if (missing.length > 0) {
        monthWork.push({ month, missing });
      } else {
        cachedMonthsList.push(month);
      }
    }

    if (cachedMonthsList.length > 0) {
      const recent = cachedMonthsList.slice(0, 5).join(", ");
      const suffix = cachedMonthsList.length > 5 ? ` +${cachedMonthsList.length - 5} more` : "";
      logger.info("Prefetch", `${cachedMonthsList.length} months cached for ${org}: ${recent}${suffix}`);
    }

    if (monthWork.length === 0) {
      logger.info("Prefetch", `All ${monthsToProcess.length} months cached for ${org}, nothing to do`);
      progress = { queriesDone: 0, totalQueries: 0, org, completedAt: Date.now() };
      return;
    }

    progress = { queriesDone: 0, totalQueries: monthWork.reduce((s, w) => s + Math.ceil(w.missing.length / BATCH_SIZE), 0), org, completedAt: 0 };

    logger.info(
      "Prefetch",
      `Starting for ${org}: ${monthWork.length} months to fetch, ${cachedMonthsList.length} cached, ~${progress.totalQueries} queries`,
    );

    const startTime = Date.now();

    for (const { month, missing } of monthWork) {
      logger.info("Prefetch", `${org}/${month}: ${missing.length} members to fetch`);

      for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        await waitForLeaderboard();

        const batch = missing.slice(i, i + BATCH_SIZE);
        const query = buildMonthQuery(batch, month, orgId);

        try {
          const data = await graphql<Record<string, any>>(query, {}, `prefetch/${org}/${month}`);

          const entries: MonthlyContribution[] = [];
          const profiles: { login: string; name: string | null; avatarUrl: string }[] = [];
          for (let j = 0; j < batch.length; j++) {
            const u = data[`u${j}`];
            if (!u?.c) continue;

            profiles.push({ login: u.login, name: u.name, avatarUrl: u.avatarUrl });

            entries.push({
              login: u.login,
              yearMonth: month,
              commits: u.c.totalCommitContributions || 0,
              prs: u.c.totalPullRequestContributions || 0,
              reviews: u.c.totalPullRequestReviewContributions || 0,
            });
          }

          saveContributions(org, entries);
          saveProfiles(profiles);
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 403) {
            logger.warn("Prefetch", `Got 403, pausing 30s`);
            await new Promise((r) => setTimeout(r, 30000));
            i -= BATCH_SIZE;
            continue;
          }
          logger.error("Prefetch", `${month} batch failed: ${err}`);
        }

        progress.queriesDone++;
        if (i + BATCH_SIZE < missing.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = progress.queriesDone / (elapsed / 60);
      const remaining = progress.totalQueries - progress.queriesDone;
      const etaRemaining = remaining / (rate / 60);

      logger.info(
        "Prefetch",
        `${org}/${month} done (${progress.queriesDone}/${progress.totalQueries} queries, ${Math.round(rate)}/min, ETA ${formatEta(etaRemaining)})`,
      );
    }

    progress.completedAt = Date.now();
    logger.info("Prefetch", `Completed for ${org}: ${progress.queriesDone} queries in ${formatEta((Date.now() - startTime) / 1000)}`);
  } finally {
    prefetchRunning = false;
  }
}
