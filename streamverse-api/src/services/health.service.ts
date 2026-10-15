import { env } from "../config/env";
import { pingDatabase } from "../repositories/health.repository";

type CheckStatus = "ok" | "unavailable" | "disabled";

export interface QueueStats {
  waiting: number;
  active: number;
  failed: number;
}

export interface Readiness {
  ready: boolean;
  checks: Record<string, CheckStatus>;
  queues?: Record<string, QueueStats>;
}

export const getLiveness = () => ({
  status: "ok" as const,
  uptimeSeconds: Math.round(process.uptime()),
  timestamp: new Date().toISOString(),
});

/** Ready = every dependency this phase needs is reachable. Reports status only, never error text or connection details. */
export async function getReadiness(): Promise<Readiness> {
  const checks: Record<string, CheckStatus> = {};

  // Database check — always required
  try {
    await pingDatabase();
    checks["database"] = "ok";
  } catch {
    checks["database"] = "unavailable";
  }

  // Redis check — only relevant when configured
  if (env.REDIS_URL) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const IORedis = await import("ioredis").then((m) => (m.default ?? m) as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const client = new IORedis(env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1 }) as import("ioredis").Redis;
      await client.connect();
      await client.ping();
      await client.quit();
      checks["redis"] = "ok";
    } catch {
      checks["redis"] = "unavailable";
    }
  } else {
    checks["redis"] = "disabled";
  }

  const isReady = Object.values(checks).every((c) => c === "ok" || c === "disabled");

  // Queue health check — only when BullMQ is the driver
  if (env.QUEUE_DRIVER === "bullmq" && env.REDIS_URL) {
    try {
      const { Queue } = await import("bullmq");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const IORedis = await import("ioredis").then((m) => (m.default ?? m) as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const connection = new IORedis(env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1 }) as import("ioredis").Redis;
      await connection.connect();

      const queueNames = ["video-processing", "audio-processing", "media-cleanup"] as const;
      const queues: Record<string, QueueStats> = {};

      for (const name of queueNames) {
        const q = new Queue(name, { connection });
        const [waiting, active, failed] = await Promise.all([q.getWaitingCount(), q.getActiveCount(), q.getFailedCount()]);
        queues[name] = { waiting, active, failed };
        await q.close();
      }

      await connection.quit();
      checks["queues"] = "ok";

      return { ready: isReady && checks["queues"] === "ok", checks, queues };
    } catch {
      checks["queues"] = "unavailable";
    }
  }

  return { ready: isReady, checks };
}
