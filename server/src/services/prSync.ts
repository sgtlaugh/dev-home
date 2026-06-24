import { getConfig } from "../config";
import { createGitHubClient } from "../clients/githubApiClient";
import { graphql } from "../clients/githubGraphqlClient";
import { logger } from "../utils/logger";
import { SEARCH_PRS_QUERY } from "../routes/github/queries";
import {
  buildYearRanges,
  fetchPRsForSubRange,
  fetchUserJoinDate,
  mapGraphQLPr,
} from "../routes/github/helpers";
import { upsertPRs, getWatermark, setWatermark, Involvement } from "./prStore";

const PARALLEL_BATCH = 4;

let syncRunning = false;

export function isSyncRunning(): boolean {
  return syncRunning;
}

export async function syncPRs(): Promise<void> {
  if (syncRunning) {
    logger.info("PRSync", "Already running, skipping");
    return;
  }
  syncRunning = true;

  try {
    await syncByInvolvement("author");
    await syncByInvolvement("involved");
  } finally {
    syncRunning = false;
  }
}

async function syncByInvolvement(involvement: Involvement): Promise<void> {
  const dataType = `prs_${involvement}`;
  const watermark = getWatermark(dataType);

  try {
    if (!watermark) {
      logger.info("PRSync", `Full sync for ${involvement} PRs`);
      await fullSync(involvement);
    } else {
      logger.info("PRSync", `Incremental sync for ${involvement} PRs (watermark: ${watermark})`);
      await incrementalSync(involvement, watermark);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("PRSync", `${involvement} sync failed: ${message}`);
  }
}

function buildSearchPrefix(username: string, involvement: Involvement): string {
  if (involvement === "author") {
    return `author:${username} type:pr`;
  }
  return `involves:${username} -author:${username} type:pr`;
}

async function fullSync(involvement: Involvement): Promise<void> {
  const config = getConfig();
  const github = createGitHubClient();
  const joinDate = await fetchUserJoinDate(github, config.githubUsername);

  if (!joinDate) {
    logger.warn("PRSync", "Could not determine join date, skipping full sync");
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const yearRanges = buildYearRanges(joinDate, today);
  const queryPrefix = buildSearchPrefix(config.githubUsername, involvement);

  const allPRs: any[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < yearRanges.length; i += PARALLEL_BATCH) {
    const batch = yearRanges.slice(i, i + PARALLEL_BATCH);
    const results = await Promise.all(
      batch.map((range) => fetchPRsForSubRange(queryPrefix, range.start, range.end)),
    );

    for (const nodes of results) {
      for (const node of nodes) {
        const id = node.url || node.id;
        if (!seen.has(id)) {
          seen.add(id);
          allPRs.push(node);
        }
      }
    }
  }

  const mapped = allPRs.map(mapGraphQLPr);
  upsertPRs(mapped, involvement);

  const maxUpdatedAt = mapped.reduce((max, pr) => (pr.updated_at > max ? pr.updated_at : max), "");
  if (maxUpdatedAt) {
    setWatermark(`prs_${involvement}`, maxUpdatedAt);
  }

  logger.info("PRSync", `Full sync complete: ${mapped.length} ${involvement} PRs`);
}

async function incrementalSync(involvement: Involvement, watermark: string): Promise<void> {
  const config = getConfig();
  const queryPrefix = buildSearchPrefix(config.githubUsername, involvement);
  const q = `${queryPrefix} updated:>${watermark}`;

  const allPRs: any[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    try {
      const result: {
        search: { nodes: any[]; pageInfo: { hasNextPage: boolean; endCursor: string } };
      } = await graphql(SEARCH_PRS_QUERY, { query: q, first: 100, after: cursor }, "pr-sync/incremental");

      if (!result?.search) break;
      allPRs.push(...(result.search.nodes || []));
      hasNextPage = result.search.pageInfo?.hasNextPage ?? false;
      cursor = result.search.pageInfo?.endCursor ?? null;
    } catch (error) {
      logger.error("PRSync", `Incremental fetch failed: ${error}`);
      return;
    }
  }

  if (allPRs.length === 0) {
    logger.info("PRSync", `No ${involvement} PR updates since ${watermark}`);
    return;
  }

  const mapped = allPRs.map(mapGraphQLPr);
  upsertPRs(mapped, involvement);

  const maxUpdatedAt = mapped.reduce(
    (max, pr) => (pr.updated_at > max ? pr.updated_at : max),
    watermark,
  );
  setWatermark(`prs_${involvement}`, maxUpdatedAt);

  logger.info("PRSync", `Incremental sync: ${mapped.length} ${involvement} PRs updated`);
}
