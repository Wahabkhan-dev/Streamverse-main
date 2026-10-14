/**
 * Phase 8: in-memory entitlement decision cache.
 * TTL is configurable via `ENTITLEMENT_CACHE_TTL_SECONDS` (default 60 s). Set to 0 to disable.
 * Thread-safe for a single Node.js process; upgrade to Redis for multi-instance deployments.
 *
 * Cache key: `${userId ?? "anon"}:${contentId}:${contentType}`
 */
import type { AccessDecision } from "./entitlement.service";
import { env } from "../../config/env";

interface CacheEntry {
  value: AccessDecision;
  expiresAt: number; // epoch ms
}

const store = new Map<string, CacheEntry>();

export function cacheKey(userId: string | undefined, contentId: string, contentType: string): string {
  return `${userId ?? "anon"}:${contentId}:${contentType}`;
}

export function get(key: string): AccessDecision | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function set(key: string, value: AccessDecision, ttlMs?: number): void {
  const ttl = ttlMs ?? env.ENTITLEMENT_CACHE_TTL_SECONDS * 1000;
  if (ttl <= 0) return; // caching disabled
  store.set(key, { value, expiresAt: Date.now() + ttl });
}

/** Remove all entries for this user (call on subscription change, suspension, age update, country update). */
export function invalidateUser(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Remove all entries for this content (call on admin status/visibility/restriction change). */
export function invalidateContent(contentId: string): void {
  for (const key of store.keys()) {
    // key format: userId:contentId:contentType
    const parts = key.split(":");
    if (parts[1] === contentId) store.delete(key);
  }
}

/** Wipe the entire cache (test teardown, emergency). */
export function clear(): void {
  store.clear();
}

/** Size of the cache (for diagnostics). */
export function size(): number {
  return store.size;
}
