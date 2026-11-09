import type { Redis } from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { onShutdown } from "../config/lifecycle";

/**
 * Optional shared second level for analyticsCache (see analyticsCache.ts). With several API instances, each one's in-memory
 * cache is filled from — and written to — Redis, so a public page is built once for the whole fleet, and an admin change
 * clears every instance at once (keys deleted in Redis + an invalidation message every instance listens to).
 *
 * Only PUBLIC data goes here: keys under SHARED_PREFIXES. Anything per-user never reaches this module.
 * Redis is a speed-up, never a dependency: when REDIS_URL is unset, CACHE_DRIVER=memory, or Redis is slow/down, every call
 * here resolves to "nothing" within a few hundred milliseconds and the caller simply computes the value itself.
 */
export const SHARED_PREFIXES = ["homepage:", "media:playlist:"] as const;
export const isSharedKey = (key: string) => SHARED_PREFIXES.some((p) => key.startsWith(p));

const NS = "sv:cache:";
const CHANNEL = "sv:cache:invalidate";

export interface RemoteEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil: number;
}

/* ------------------------------------------------------------- encoding (keeps Date / Map / Set / BigInt intact) */

function replacer(this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key];
  if (raw instanceof Date) return { $d: raw.toISOString() };
  if (raw instanceof Map) return { $m: [...raw.entries()] };
  if (raw instanceof Set) return { $s: [...raw.values()] };
  if (typeof raw === "bigint") return { $b: raw.toString() };
  return value;
}
function reviver(_key: string, value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    const keys = Object.keys(v);
    if (keys.length === 1) {
      if (typeof v.$d === "string") return new Date(v.$d);
      if (Array.isArray(v.$m)) return new Map(v.$m as [unknown, unknown][]);
      if (Array.isArray(v.$s)) return new Set(v.$s);
      if (typeof v.$b === "string") return BigInt(v.$b);
    }
  }
  return value;
}
export const encode = (entry: RemoteEntry<unknown>) => JSON.stringify(entry, replacer);
export const decode = <T>(text: string) => JSON.parse(text, reviver) as RemoteEntry<T>;

/* ------------------------------------------------------------- connection */

let client: Redis | null | undefined;
let subscriber: Redis | null = null;
let onRemoteInvalidate: ((prefix: string) => void) | null = null;
let warned = false;

const enabled = () => env.CACHE_DRIVER !== "memory" && !!env.REDIS_URL && env.NODE_ENV !== "test";

function connection(): Redis | null {
  if (client !== undefined) return client;
  if (!enabled()) return (client = null);
  // Loaded only when Redis caching is actually on, so a memory-only deployment never opens a socket.
  const IORedis = require("ioredis") as typeof import("ioredis");
  const RedisCtor = ((IORedis as unknown as { default?: unknown }).default ?? IORedis) as new (url: string, opts: object) => Redis;
  const opts = { commandTimeout: 300, connectTimeout: 3000, maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false };
  client = new RedisCtor(env.REDIS_URL!, opts);
  client.on("error", (err) => {
    if (!warned) logger.warn({ err: err.message }, "redis cache unavailable; serving from memory and the database");
    warned = true;
  });
  client.on("ready", () => {
    if (warned) logger.info("redis cache connected again");
    warned = false;
  });
  subscriber = new RedisCtor(env.REDIS_URL!, { ...opts, commandTimeout: undefined, enableOfflineQueue: true });
  subscriber.on("error", () => undefined);
  subscriber.on("message", (_channel, prefix: string) => onRemoteInvalidate?.(prefix));
  void subscriber.subscribe(CHANNEL).catch(() => undefined);
  onShutdown("redis cache", async () => {
    await Promise.allSettled([client?.quit(), subscriber?.quit()]);
  });
  return client;
}

/**
 * Called once by analyticsCache: what to do when ANOTHER instance announces an invalidation. Does not connect by itself — the
 * connection opens on the first shared cache use, so a script that merely imports this code never holds a socket open.
 */
export function listenForRemoteInvalidation(handler: (prefix: string) => void) {
  onRemoteInvalidate = handler;
}

export const redisCacheEnabled = () => connection() !== null;

/** Tests only: use these (fake) clients instead of connecting to REDIS_URL. `null` turns Redis caching off again. */
export function __setRedisClientsForTests(main: Redis | null, sub: Redis | null = null) {
  client = main;
  subscriber = sub;
  sub?.on("message", (_channel: string, prefix: string) => onRemoteInvalidate?.(prefix));
  void sub?.subscribe(CHANNEL);
}

export async function remoteGet<T>(key: string): Promise<RemoteEntry<T> | undefined> {
  const redis = connection();
  if (!redis || redis.status !== "ready") return undefined;
  try {
    const text = await redis.get(NS + key);
    return text ? decode<T>(text) : undefined;
  } catch {
    return undefined;
  }
}

export async function remoteSet(key: string, entry: RemoteEntry<unknown>): Promise<void> {
  const redis = connection();
  if (!redis || redis.status !== "ready") return;
  const ms = entry.staleUntil - Date.now();
  if (ms <= 0) return;
  let text: string;
  try {
    text = encode(entry);
  } catch {
    return; // not representable (should not happen for public payloads) — stays in this instance's memory only
  }
  await redis.set(NS + key, text, "PX", ms).catch(() => undefined);
}

async function deleteByPrefix(redis: Redis, prefix: string) {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${NS}${prefix}*`, "COUNT", 500);
    cursor = next;
    if (keys.length) await redis.unlink(...keys);
  } while (cursor !== "0");
}

/**
 * Deletes the shared entries under `prefix` and tells every other instance to drop its in-memory copies. Runs the delete a
 * second time shortly after, so a value another instance was still computing from pre-change data when the change landed
 * cannot survive in Redis.
 */
export async function remoteInvalidate(prefix: string | undefined): Promise<void> {
  const redis = connection();
  if (!redis || redis.status !== "ready") return;
  const target = prefix ?? "";
  if (prefix && !isSharedKey(prefix) && !SHARED_PREFIXES.some((p) => p.startsWith(prefix))) return;
  try {
    await deleteByPrefix(redis, target);
    await redis.publish(CHANNEL, target);
    setTimeout(() => void deleteByPrefix(redis, target).catch(() => undefined), 1500).unref();
  } catch {
    // Redis unreachable: entries expire on their own TTL; this instance's memory is already cleared.
  }
}
