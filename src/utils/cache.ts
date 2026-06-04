interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private ttl = 5 * 60 * 1000; // 5 minutes

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      if (import.meta.env.DEV) console.log(`[Cache] MISS ${key}`);
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;
    if (age > this.ttl) {
      if (import.meta.env.DEV)
        console.log(`[Cache] EXPIRED ${key} (${Math.round(age / 1000)}s old)`);
      this.cache.delete(key);
      return null;
    }

    if (import.meta.env.DEV) console.log(`[Cache] HIT ${key} (${Math.round(age / 1000)}s old)`);
    return entry.data;
  }

  set<T>(key: string, data: T): void {
    console.log(`[Cache] SET ${key}`);
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const apiCache = new ApiCache();
