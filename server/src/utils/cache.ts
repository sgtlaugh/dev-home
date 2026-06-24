import fs from "fs";
import Database from "better-sqlite3";
import path from "path";
import { logger } from "./logger";
import { SHORT_CACHE_TTL } from "./constants";

class ApiCache {
  private db: Database.Database;
  private ttl = SHORT_CACHE_TTL;

  constructor() {
    const dataDir = path.resolve(__dirname, "../../data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, "cache.db");
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
      logger.debug("Cache", `MISS ${key}`);
      return null;
    }

    const age = Date.now() - row.timestamp;
    if (age > this.ttl) {
      logger.debug("Cache", `EXPIRED ${key}`, { age: Math.round(age / 1000) });
      this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      return null;
    }

    logger.debug("Cache", `HIT ${key}`, { age: Math.round(age / 1000) });
    return JSON.parse(row.data);
  }

  getStale<T>(key: string): { data: T; fresh: boolean } | null {
    const row = this.db.prepare("SELECT data, timestamp FROM cache WHERE key = ?").get(key) as
      | { data: string; timestamp: number }
      | undefined;

    if (!row) return null;

    const age = Date.now() - row.timestamp;
    return { data: JSON.parse(row.data), fresh: age <= this.ttl };
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    logger.debug("Cache", `SET ${key}${ttlMs ? ` (ttl: ${Math.round(ttlMs / 1000)}s)` : ""}`);
    const effectiveTimestamp = ttlMs ? Date.now() + ttlMs - this.ttl : Date.now();
    this.db
      .prepare("INSERT OR REPLACE INTO cache (key, data, timestamp) VALUES (?, ?, ?)")
      .run(key, JSON.stringify(data), effectiveTimestamp);
  }

  clear(): void {
    this.db.prepare("DELETE FROM cache").run();
  }

  size(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM cache").get() as { cnt: number };
    return row.cnt;
  }

  private cleanExpired(): void {
    const cutoff = Date.now() - this.ttl;
    const result = this.db.prepare("DELETE FROM cache WHERE timestamp < ?").run(cutoff);
    if (result.changes > 0) {
      logger.info("Cache", `Cleaned ${result.changes} expired entries`);
    }
  }
}

export const apiCache = new ApiCache();
