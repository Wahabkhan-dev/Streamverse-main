import { env } from "./env";

/**
 * Redis is optional infrastructure (rate-limit store, queues, workers). Phase 1 only records whether it is
 * configured; a client is created here once a phase needs one, and registers itself for graceful shutdown.
 */
export const redisConfig = env.REDIS_URL ? { url: env.REDIS_URL } : null;
export const redisConfigured = redisConfig !== null;
