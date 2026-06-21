import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let db: Database.Database | null = null;

/**
 * Resolve the path to the SQLite database file.
 *
 * Default location: /home/hashlife/Github/dev-home/data/dev-home.db
 *
 * Resolution:
 * - tsx dev: __dirname = /server/src → ../../data
 * - bundle: __dirname = /server/dist → ../../data
 * - Both resolve to app root /data/dev-home.db
 *
 * Override with DEV_HOME_DB_PATH env var for custom location.
 */
export function getDbPath(): string {
  if (process.env.DEV_HOME_DB_PATH) {
    return process.env.DEV_HOME_DB_PATH;
  }

  const dataDir = path.resolve(__dirname, "../../data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return path.join(dataDir, "dev-home.db");
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
// Consolidated migration list. Safe to restructure since this is a single-user
// Electron app — cached data repopulates on startup, only notes are user data.
// ---------------------------------------------------------------------------

type Migration = (d: Database.Database) => void;

const MIGRATIONS: Migration[] = [
  // 1 – notes table (consolidated from original migrations 1, 3, 4)
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        reference_id TEXT DEFAULT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        title TEXT NOT NULL DEFAULT ''
      );
    `);
  },

  // 2 – org_contributions table for leaderboard cache
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS org_contributions (
        org TEXT NOT NULL,
        login TEXT NOT NULL,
        year_month TEXT NOT NULL,
        commits INTEGER NOT NULL DEFAULT 0,
        prs INTEGER NOT NULL DEFAULT 0,
        reviews INTEGER NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (org, login, year_month)
      );
      CREATE INDEX IF NOT EXISTS idx_org_contributions_org ON org_contributions(org);
      CREATE INDEX IF NOT EXISTS idx_org_contributions_month ON org_contributions(org, year_month);
    `);
  },

  // 3 – github_profiles table for caching user avatars/names
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS github_profiles (
        login TEXT PRIMARY KEY,
        name TEXT,
        avatar_url TEXT NOT NULL,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },

  // 4 – user_contribution_cache for monthly commit counts and PR data
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS user_contribution_cache (
        year_month TEXT PRIMARY KEY,
        commit_count INTEGER NOT NULL DEFAULT 0,
        prs_json TEXT,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },

  // 5 – activity_cache for persistent activity storage
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS activity_cache (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        action TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        metadata_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_activity_cache_timestamp ON activity_cache(timestamp);
    `);
  },

  // 6 – drop legacy tables from pre-consolidation migrations
  (d) => {
    d.exec(`
      DROP TABLE IF EXISTS kanban_items;
      DROP TABLE IF EXISTS user_commit_cache;
    `);
  },
];

function runMigrations(d: Database.Database): void {
  d.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");

  const row = d.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  const current = row?.version ?? 0;

  if (current >= MIGRATIONS.length) return;

  for (let i = current; i < MIGRATIONS.length; i++) {
    d.transaction(() => {
      MIGRATIONS[i](d);
      d.exec("DELETE FROM schema_version");
      d.prepare("INSERT INTO schema_version (version) VALUES (?)").run(i + 1);
    })();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get (or lazily initialize) the SQLite database connection.
 * Enables WAL mode and runs pending migrations.
 */
export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");

  runMigrations(db);

  return db;
}

/**
 * Close the database connection for graceful shutdown.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
