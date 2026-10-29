import { env } from "../config/env";

interface CacheEntry<T> {
  value: T;
  /** Fresh until here. */
  expiresAt: number;
  /** May still be served (while a refresh runs in the background) until here. */
  staleUntil: number;
  /** How to rebuild it, and when it was last asked for — lets refreshAging() keep popular entries warm. */
  rebuild?: { fn: () => Promise<unknown>; ttl: number; stale: number };
  lastHit: number;
}

/**
 * Simple in-memory key→value cache with TTL. Not distributed — per-process only.
 *
 * Two things keep slow computations off the request path:
 *  - concurrent misses for one key share a single computation (no thundering herd on the database);
 *  - an expired-but-recent entry is served immediately while one background refresh replaces it
 *    (stale-while-revalidate), so visitors never wait for a rebuild once the cache has been filled.
 */
class AnalyticsCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  /** Bumped by every invalidate(); a computation that started before one must not store its (possibly outdated) result. */
  private generation = 0;

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) return undefined;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number, staleSeconds = 0, rebuild?: () => Promise<T>): void {
    if (ttlSeconds <= 0) return; // caching disabled
    const now = Date.now();
    const previous = this.store.get(key);
    this.store.set(key, {
      value,
      expiresAt: now + ttlSeconds * 1000,
      staleUntil: now + (ttlSeconds + Math.max(0, staleSeconds)) * 1000,
      rebuild: rebuild ? { fn: rebuild, ttl: ttlSeconds, stale: staleSeconds } : previous?.rebuild,
      lastHit: previous?.lastHit ?? now,
    });
  }

  invalidate(prefix?: string): void {
    this.generation++;
    if (!prefix) {
      this.store.clear();
      this.inflight.clear();
      return;
    }
    for (const key of this.store.keys()) if (key.startsWith(prefix)) this.store.delete(key);
    for (const key of this.inflight.keys()) if (key.startsWith(prefix)) this.inflight.delete(key);
  }

  private compute<T>(key: string, fn: () => Promise<T>, ttlSeconds: number, staleSeconds: number): Promise<T> {
    const running = this.inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const startedAt = this.generation;
    const promise = fn()
      .then((value) => {
        if (this.generation === startedAt) this.set(key, value, ttlSeconds, staleSeconds, fn);
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Get-or-set: returns the cached value if fresh; if it is only stale (within `staleSeconds` after expiry) returns it at
   * once and refreshes in the background; otherwise computes, caches and returns the result.
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, ttlSeconds?: number, staleSeconds = 0): Promise<T> {
    const ttl = ttlSeconds ?? env.ANALYTICS_CACHE_TTL_SECONDS;
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();
    if (entry) entry.lastHit = now;
    if (entry && now <= entry.expiresAt) return entry.value;
    if (entry && now <= entry.staleUntil) {
      void this.compute(key, fn, ttl, staleSeconds).catch(() => undefined); // keep serving the stale copy if the refresh fails
      return entry.value;
    }
    if (entry) this.store.delete(key);
    return this.compute(key, fn, ttl, staleSeconds);
  }

  /**
   * Rebuilds, in the background, entries under `prefix` that are 60% through their fresh time and were asked for within the
   * last `maxIdleMs` — so anything people are actually using never expires and no visitor waits for a rebuild. Returns how
   * many rebuilds were started. A failed rebuild keeps the old entry.
   */
  refreshAging(prefix: string, maxIdleMs: number): number {
    const now = Date.now();
    let started = 0;
    for (const [key, entry] of this.store) {
      if (!key.startsWith(prefix) || !entry.rebuild) continue;
      if (now - entry.lastHit > maxIdleMs) continue;
      const freshFor = entry.rebuild.ttl * 1000;
      if (now < entry.expiresAt - freshFor * 0.4) continue; // still young
      if (this.inflight.has(key)) continue;
      started++;
      void this.compute(key, entry.rebuild.fn, entry.rebuild.ttl, entry.rebuild.stale).catch(() => undefined);
    }
    return started;
  }
}

export const analyticsCache = new AnalyticsCache();

/**
 * How long a public payload that embeds signed image links may be cached: fresh for HOMEPAGE_CACHE_TTL_SECONDS, then served
 * stale while refreshing — but never longer than half the link lifetime in total, so a cached link is never expired.
 */
export function publicCacheWindow(): { ttl: number; stale: number } {
  const ttl = env.HOMEPAGE_CACHE_TTL_SECONDS;
  const budget = Math.floor(env.DOWNLOAD_URL_TTL_SECONDS / 2);
  return { ttl, stale: Math.max(0, Math.min(ttl * 4, budget - ttl)) };
}
