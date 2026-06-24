import { getDb } from "../db";
import { logger } from "../utils/logger";

export type Involvement = "author" | "involved";

interface PRRow {
  id: number;
  involvement: string;
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: number;
  merged: number;
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  user_login: string;
  user_avatar_url: string;
  head_ref: string;
  base_ref: string;
  repository_url: string;
  repo_full_name: string;
  checks_status: string | null;
  review_status: string | null;
  additions: number;
  deletions: number;
}

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft: boolean;
  merged: boolean;
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
  head: { ref: string };
  base: { ref: string };
  repository_url: string;
  repo_full_name: string;
  checks_status: string | null;
  review_status: string | null;
  additions: number;
  deletions: number;
}

function rowToPR(row: PRRow): GitHubPR {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    html_url: row.html_url,
    state: row.state,
    draft: row.draft === 1,
    merged: row.merged === 1,
    merged_at: row.merged_at,
    closed_at: row.closed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: { login: row.user_login, avatar_url: row.user_avatar_url },
    head: { ref: row.head_ref },
    base: { ref: row.base_ref },
    repository_url: row.repository_url,
    repo_full_name: row.repo_full_name,
    checks_status: row.checks_status,
    review_status: row.review_status,
    additions: row.additions,
    deletions: row.deletions,
  };
}

const UPSERT_SQL = `
  INSERT INTO prs (
    id, involvement, number, title, html_url, state, draft, merged,
    merged_at, closed_at, created_at, updated_at, user_login, user_avatar_url,
    head_ref, base_ref, repository_url, repo_full_name,
    checks_status, review_status, additions, deletions
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?
  ) ON CONFLICT(id, involvement) DO UPDATE SET
    number = excluded.number,
    title = excluded.title,
    html_url = excluded.html_url,
    state = excluded.state,
    draft = excluded.draft,
    merged = excluded.merged,
    merged_at = excluded.merged_at,
    closed_at = excluded.closed_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    user_login = excluded.user_login,
    user_avatar_url = excluded.user_avatar_url,
    head_ref = excluded.head_ref,
    base_ref = excluded.base_ref,
    repository_url = excluded.repository_url,
    repo_full_name = excluded.repo_full_name,
    checks_status = excluded.checks_status,
    review_status = excluded.review_status,
    additions = excluded.additions,
    deletions = excluded.deletions
`;

export function upsertPRs(prs: GitHubPR[], involvement: Involvement): void {
  if (prs.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(UPSERT_SQL);

  db.transaction((items: GitHubPR[]) => {
    for (const pr of items) {
      stmt.run(
        pr.id,
        involvement,
        pr.number,
        pr.title,
        pr.html_url,
        pr.state,
        pr.draft ? 1 : 0,
        pr.merged ? 1 : 0,
        pr.merged_at,
        pr.closed_at,
        pr.created_at,
        pr.updated_at,
        pr.user.login,
        pr.user.avatar_url,
        pr.head.ref,
        pr.base.ref,
        pr.repository_url,
        pr.repo_full_name,
        pr.checks_status,
        pr.review_status,
        pr.additions,
        pr.deletions,
      );
    }
  })(prs);

  logger.info("PRStore", `Upserted ${prs.length} ${involvement} PRs`);
}

export function getOpenAuthoredPRs(): GitHubPR[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM prs WHERE state = 'open' AND involvement = 'author' ORDER BY updated_at DESC",
    )
    .all() as PRRow[];
  return rows.map(rowToPR);
}

export function getOpenInvolvedPRs(): GitHubPR[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM prs WHERE state = 'open' AND involvement = 'involved' ORDER BY updated_at DESC",
    )
    .all() as PRRow[];
  return rows.map(rowToPR);
}

export function getAuthoredPRsByDateRange(startDate: string, endDate: string): GitHubPR[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM prs
     WHERE involvement = 'author' AND created_at >= ? AND created_at <= ?
     ORDER BY created_at DESC`,
    )
    .all(`${startDate}T00:00:00Z`, `${endDate}T23:59:59Z`) as PRRow[];
  return rows.map(rowToPR);
}

export function getInvolvedPRsByDateRange(startDate: string, endDate: string): GitHubPR[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM prs
     WHERE involvement = 'involved' AND created_at >= ? AND created_at <= ?
     ORDER BY created_at DESC`,
    )
    .all(`${startDate}T00:00:00Z`, `${endDate}T23:59:59Z`) as PRRow[];
  return rows.map(rowToPR);
}

export function getWatermark(dataType: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT watermark FROM sync_state WHERE data_type = ?").get(dataType) as
    | { watermark: string }
    | undefined;
  return row?.watermark ?? null;
}

export function setWatermark(dataType: string, watermark: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO sync_state (data_type, watermark, last_synced_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(data_type) DO UPDATE SET watermark = ?, last_synced_at = datetime('now')`,
  ).run(dataType, watermark, watermark);
}
