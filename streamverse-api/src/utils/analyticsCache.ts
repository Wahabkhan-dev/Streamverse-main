import { env } from "../config/env";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Simple in-memory key→value cache with TTL. Not distributed — per-process only. */
class AnalyticsCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    if (ttlSeconds <= 0) return; // caching disabled
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /**
   * Get-or-set: returns cached value if fresh, otherwise calls `fn`, caches the result and returns it.
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await fn();
    this.set(key, value, ttlSeconds ?? env.ANALYTICS_CACHE_TTL_SECONDS);
    return value;
  }
}

export const analyticsCache = new AnalyticsCache();
