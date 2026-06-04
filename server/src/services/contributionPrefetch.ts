import { graphql } from "../clients/githubGraphqlClient";
import { MAX_REPOS_PER_CONTRIBUTION } from "../utils/constants";
import { logger } from "../utils/logger";
import {
  getMonthsBetween,
  getMemberCountForMonth,
  saveContributions,
  MonthlyContribution,
} from "./contributionCache";

const QUERIES_PER_MINUTE = 40;
const DELAY_BETWEEN_QUERIES_MS = Math.ceil(60000 / QUERIES_PER_MINUTE);
const BATCH_SIZE = 5;

let prefetchRunning = false;

function buildMonthQuery(logins: string[], yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${yearMonth}-01T00:00:00Z`;
  const to = `${yearMonth}-${lastDay.toString().padStart(2, "0")}T23:59:59Z`;

  const users = logins.map(
    (login, i) =>
      `u${i}: user(login: "${login}") {
        login name avatarUrl
        c: contributionsCollection(from: "${from}", to: "${to}") {
          commitContributionsByRepository(maxRepositories: ${MAX_REPOS_PER_CONTRIBUTION}) {
            repository { nameWithOwner }
            contributions { totalCount }
          }
          pullRequestContributionsByRepository(maxRepositories: ${MAX_REPOS_PER_CONTRIBUTION}) {
            repository { nameWithOwner }
            contributions { totalCount }
          }
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

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
}

export function isPrefetchRunning(): boolean {
  return prefetchRunning;
}

export async function startPrefetch(
  org: string,
  members: string[],
  startYearMonth = "2008-01",
): Promise<void> {
  if (prefetchRunning) {
    logger.info("Prefetch", "Already running, skipping");
    return;
  }

  prefetchRunning = true;
  const currentMonth = getCurrentYearMonth();

  try {
    const allMonths = getMonthsBetween(`${startYearMonth}-01`, `${currentMonth}-28`);
    const monthsToProcess = allMonths.filter((m) => m !== currentMonth).reverse();

    const missingMonths = monthsToProcess.filter(
      (month) => getMemberCountForMonth(org, month) < members.length,
    );

    if (missingMonths.length === 0) {
      logger.info("Prefetch", `All ${allMonths.length} months cached for ${org}, nothing to do`);
      return;
    }

    const totalQueries = Math.ceil(members.length / BATCH_SIZE) * missingMonths.length;
    const etaSeconds = (totalQueries * DELAY_BETWEEN_QUERIES_MS) / 1000;

    logger.info(
      "Prefetch",
      `Starting for ${org}: ${missingMonths.length} months, ${members.length} members, ~${totalQueries} queries, ETA ${formatEta(etaSeconds)}`,
    );

    let queriesDone = 0;
    const startTime = Date.now();

    for (const month of missingMonths) {
      if (!prefetchRunning) {
        logger.info("Prefetch", "Stopped");
        return;
      }

      for (let i = 0; i < members.length; i += BATCH_SIZE) {
        if (!prefetchRunning) return;

        const batch = members.slice(i, i + BATCH_SIZE);
        const query = buildMonthQuery(batch, month);

        try {
          const data = await graphql<Record<string, any>>(query, {}, `prefetch/${org}/${month}`);

          const orgPrefix = `${org}/`;
          const entries: MonthlyContribution[] = [];
          for (let j = 0; j < batch.length; j++) {
            const u = data[`u${j}`];
            if (!u?.c) continue;

            const commitRepos = u.c.commitContributionsByRepository || [];
            if (commitRepos.length >= MAX_REPOS_PER_CONTRIBUTION) {
              logger.warn("Prefetch", `${u.login} hit ${MAX_REPOS_PER_CONTRIBUTION} repo cap for commits in ${month}`);
            }
            let commits = 0;
            for (const repo of commitRepos) {
              if (repo.repository.nameWithOwner.startsWith(orgPrefix))
                commits += repo.contributions.totalCount || 0;
            }

            const prRepos = u.c.pullRequestContributionsByRepository || [];
            if (prRepos.length >= MAX_REPOS_PER_CONTRIBUTION) {
              logger.warn("Prefetch", `${u.login} hit ${MAX_REPOS_PER_CONTRIBUTION} repo cap for PRs in ${month}`);
            }
            let prs = 0;
            for (const repo of prRepos) {
              if (repo.repository.nameWithOwner.startsWith(orgPrefix))
                prs += repo.contributions.totalCount || 0;
            }

            entries.push({
              login: u.login,
              yearMonth: month,
              commits,
              prs,
              reviews: u.c.totalPullRequestReviewContributions || 0,
            });
          }

          saveContributions(org, entries);
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 403) {
            logger.warn("Prefetch", `Got 403, pausing 30s`);
            await new Promise((r) => setTimeout(r, 30000));
            i -= BATCH_SIZE; // retry this batch
            continue;
          }
          logger.error("Prefetch", `${month} batch failed: ${err}`);
        }

        queriesDone++;
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_QUERIES_MS));
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = queriesDone / (elapsed / 60);
      const remaining = totalQueries - queriesDone;
      const etaRemaining = remaining / (rate / 60);

      logger.info(
        "Prefetch",
        `${org}/${month} done (${queriesDone}/${totalQueries} queries, ${Math.round(rate)}/min, ETA ${formatEta(etaRemaining)})`,
      );
    }

    logger.info("Prefetch", `Completed for ${org}: ${queriesDone} queries in ${formatEta((Date.now() - startTime) / 1000)}`);
  } finally {
    prefetchRunning = false;
  }
}

export function stopPrefetch(): void {
  prefetchRunning = false;
}
