import Database from "better-sqlite3";
import path from "path";

class ApiCache {
  private db: Database.Database;
  private ttl = 5 * 60 * 1000;

  constructor() {
    const dbPath = path.join(process.cwd(), "server", "cache.db");
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        data TEXT,
        timestamp INTEGER
      )
    `);
    this.cleanExpired();
  }

  get<T>(key: string): T | null {
    const row = this.db.prepare("SELECT data, timestamp FROM cache WHERE key = ?").get(key) as
      | { data: string; timestamp: number }
      | undefined;

    if (!row) {
      console.log(`[Cache] MISS ${key}`);
      return null;
    }

    const age = Date.now() - row.timestamp;
    if (age > this.ttl) {
      console.log(`[Cache] EXPIRED ${key} (${Math.round(age / 1000)}s old)`);
      this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      return null;
    }

    console.log(`[Cache] HIT ${key} (${Math.round(age / 1000)}s old)`);
    return JSON.parse(row.data);
  }

  set<T>(key: string, data: T): void {
    console.log(`[Cache] SET ${key}`);
    this.db
      .prepare("INSERT OR REPLACE INTO cache (key, data, timestamp) VALUES (?, ?, ?)")
      .run(key, JSON.stringify(data), Date.now());
  }

  clear(): void {
    this.db.prepare("DELETE FROM cache").run();
  }

  private cleanExpired(): void {
    const cutoff = Date.now() - this.ttl;
    const result = this.db.prepare("DELETE FROM cache WHERE timestamp < ?").run(cutoff);
    if (result.changes > 0) {
      console.log(`[Cache] Cleaned ${result.changes} expired entries on startup`);
    }
  }
}

export const apiCache = new ApiCache();
