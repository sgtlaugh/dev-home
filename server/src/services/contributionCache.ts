import { getDb } from "../db";

export interface MonthlyContribution {
  login: string;
  yearMonth: string;
  commits: number;
  prs: number;
  reviews: number;
}

export function getMonthsBetween(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = endDate.split("-").map(Number);

  let y = sy,
    m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${m.toString().padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

export function getCachedContributions(
  org: string,
  logins: string[],
  months: string[],
): Map<string, Map<string, MonthlyContribution>> {
  const db = getDb();
  const result = new Map<string, Map<string, MonthlyContribution>>();

  if (logins.length === 0 || months.length === 0) return result;

  const placeholders = logins.map(() => "?").join(",");
  const monthPlaceholders = months.map(() => "?").join(",");

  const rows = db
    .prepare(
      `SELECT login, year_month, commits, prs, reviews
       FROM org_contributions
       WHERE org = ? AND login IN (${placeholders}) AND year_month IN (${monthPlaceholders})`,
    )
    .all(org, ...logins, ...months) as {
    login: string;
    year_month: string;
    commits: number;
    prs: number;
    reviews: number;
  }[];

  for (const row of rows) {
    if (!result.has(row.login)) result.set(row.login, new Map());
    result.get(row.login)!.set(row.year_month, {
      login: row.login,
      yearMonth: row.year_month,
      commits: row.commits,
      prs: row.prs,
      reviews: row.reviews,
    });
  }

  return result;
}

export function saveContributions(
  org: string,
  entries: MonthlyContribution[],
): void {
  if (entries.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO org_contributions (org, login, year_month, commits, prs, reviews, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  );

  const insertMany = db.transaction((items: MonthlyContribution[]) => {
    for (const e of items) {
      stmt.run(org, e.login, e.yearMonth, e.commits, e.prs, e.reviews);
    }
  });

  insertMany(entries);
}

export function getMemberCountForMonth(org: string, yearMonth: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(DISTINCT login) as cnt FROM org_contributions WHERE org = ? AND year_month = ?")
    .get(org, yearMonth) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export interface CachedProfile {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export function getCachedProfiles(logins: string[]): Map<string, CachedProfile> {
  if (logins.length === 0) return new Map();
  const db = getDb();
  const placeholders = logins.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT login, name, avatar_url FROM github_profiles WHERE login IN (${placeholders})`)
    .all(...logins) as { login: string; name: string | null; avatar_url: string }[];

  const result = new Map<string, CachedProfile>();
  for (const row of rows) {
    result.set(row.login, { login: row.login, name: row.name, avatarUrl: row.avatar_url });
  }
  return result;
}

export function saveProfiles(profiles: CachedProfile[]): void {
  if (profiles.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO github_profiles (login, name, avatar_url, fetched_at)
     VALUES (?, ?, ?, datetime('now'))`,
  );
  const insertMany = db.transaction((items: CachedProfile[]) => {
    for (const p of items) {
      stmt.run(p.login, p.name, p.avatarUrl);
    }
  });
  insertMany(profiles);
}
