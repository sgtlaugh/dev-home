import { getConfig } from "../config";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import { logger } from "../utils/logger";
import {
  getMonthsBetween,
  getCachedCommitCounts,
  saveCommitCount,
  bustRecentCommitCounts,
} from "./contributionCache";
import { fetchUserJoinDate } from "../routes/github/helpers";

const MONTHS_PER_BATCH = 12;
const BUST_RECENT_MONTHS = 2;

function getRecentMonths(n: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`);
  }
  return months;
}

export async function prefetchContributions(): Promise<void> {
  const config = getConfig();
  const username = config.githubUsername;
  if (!username) return;

  const github = createGitHubClient();
  const joinDate = await fetchUserJoinDate(github, username);
  if (!joinDate) {
    logger.warn("ContribPrefetch", "Could not determine join date, skipping");
    return;
  }

  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endMonth = `${prevMonth.getFullYear()}-${(prevMonth.getMonth() + 1).toString().padStart(2, "0")}`;
  const allMonths = getMonthsBetween(joinDate, `${endMonth}-28`);

  const recentMonths = getRecentMonths(BUST_RECENT_MONTHS);
  bustRecentCommitCounts(recentMonths);
  logger.info("ContribPrefetch", `Busted cache for recent months: ${recentMonths.join(", ")}`);

  if (allMonths.length === 0) {
    logger.info("ContribPrefetch", "No months to prefetch");
    return;
  }

  const cachedCommitMonths = getCachedCommitCounts(allMonths);
  const missingCommitMonths = allMonths.filter((m) => !cachedCommitMonths.has(m));

  if (missingCommitMonths.length === 0) {
    logger.info("ContribPrefetch", `All ${allMonths.length} months cached, nothing to do`);
    return;
  }

  logger.info(
    "ContribPrefetch",
    `${allMonths.length} months total, missing: ${missingCommitMonths.length} commit months`,
  );

  await prefetchCommits(missingCommitMonths);
  logger.info("ContribPrefetch", "Done");
}

async function prefetchCommits(months: string[]): Promise<void> {
  logger.info("ContribPrefetch", `Fetching commits for ${months.length} months`);

  for (let b = 0; b < months.length; b += MONTHS_PER_BATCH) {
    const batch = months.slice(b, b + MONTHS_PER_BATCH);
    const aliases = batch.map((month, i) => {
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      return `m${i}: contributionsCollection(from: "${month}-01T00:00:00Z", to: "${month}-${lastDay.toString().padStart(2, "0")}T23:59:59Z") { totalCommitContributions }`;
    });

    try {
      const data = await graphql<{ viewer: Record<string, any> }>(
        `query { viewer { ${aliases.join("\n")} } }`,
        {},
        `contrib-prefetch/commits-${b / MONTHS_PER_BATCH + 1}-of-${Math.ceil(months.length / MONTHS_PER_BATCH)}`,
      );
      for (let i = 0; i < batch.length; i++) {
        const count = data.viewer?.[`m${i}`]?.totalCommitContributions || 0;
        saveCommitCount(batch[i], count);
      }
    } catch (err) {
      logger.error("ContribPrefetch", `Commit batch failed: ${err}`);
    }
  }

  logger.info("ContribPrefetch", `Cached commits for ${months.length} months`);
}
