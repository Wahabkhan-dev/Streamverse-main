/**
 * Shared in-memory cache for the maintenance-mode flag.
 * Kept in a separate module so maintenanceModeGuard.ts and settings.service.ts
 * can both reference it without creating a circular import.
 */

let cachedValue = false;
let cacheExpiresAt = 0;

// In test mode the fakePrisma is synchronous and near-instant, so we can safely
// disable caching (TTL=0) and re-read the setting on every request.  This ensures
// that beforeEach DB resets are immediately visible to the guard without needing
// an explicit cache-invalidation call in every test file.
const CACHE_TTL_MS = process.env["NODE_ENV"] === "test" ? 0 : 5_000;

export function readMaintenanceCache(): { value: boolean; valid: boolean } {
  return { value: cachedValue, valid: Date.now() < cacheExpiresAt };
}

export function writeMaintenanceCache(value: boolean): void {
  cachedValue = value;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
}

/** Expire the cache immediately so the next request re-reads from the DB. */
export function invalidateMaintenanceCache(): void {
  cacheExpiresAt = 0;
}
