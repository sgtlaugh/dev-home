interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private ttl = 5 * 60 * 1000;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      console.log(`[Cache] MISS ${key}`);
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > this.ttl) {
      console.log(`[Cache] EXPIRED ${key} (${Math.round(age / 1000)}s old)`);
      this.cache.delete(key);
      return null;
    }

    console.log(`[Cache] HIT ${key} (${Math.round(age / 1000)}s old)`);
    return entry.data;
  }

  set<T>(key: string, data: T): void {
    console.log(`[Cache] SET ${key}`);
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const apiCache = new ApiCache();
