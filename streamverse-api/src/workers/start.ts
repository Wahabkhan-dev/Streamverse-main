import { env } from "../config/env";
import { logger } from "../config/logger";
import { disconnectDatabase } from "../config/database";
import { onShutdown, runShutdownHooks } from "../config/lifecycle";
import { assertFfmpegAvailable } from "../services/media/ffmpeg.mediaProcessor";
import { getQueueProvider } from "../services/queue";
import { getStorageProvider } from "../services/storage";
import { registerAudioWorker } from "./audio.worker";
import { registerCleanupWorker, scheduleMediaCleanup } from "./cleanup.worker";
import { registerVideoWorker } from "./video.worker";

/**
 * Section 83: a worker process (`node dist/workers/start.js` / `tsx src/workers/start.ts`) fails loudly
 * and immediately if ffmpeg is missing, storage is misconfigured, or (for the bullmq driver) Redis is
 * unreachable — it never limps along pretending those are fine.
 */
async function main() {
  try {
    await assertFfmpegAvailable();
    logger.info("worker: ffmpeg/ffprobe OK");
  } catch (err) {
    logger.fatal({ err }, "worker: ffmpeg/ffprobe not available — video/audio processing cannot run");
    process.exit(1);
  }

  if (env.QUEUE_DRIVER === "bullmq" && !env.REDIS_URL) {
    logger.fatal("worker: QUEUE_DRIVER=bullmq but REDIS_URL is not set");
    process.exit(1);
  }

  if (env.STORAGE_PROVIDER !== "local" && !env.AWS_BUCKET) {
    logger.fatal("worker: STORAGE_PROVIDER is set but AWS_BUCKET is missing");
    process.exit(1);
  }

  registerVideoWorker();
  registerAudioWorker();
  registerCleanupWorker();
  const cleanupTimer = scheduleMediaCleanup();

  logger.info({ queueDriver: env.QUEUE_DRIVER, storageProvider: env.STORAGE_PROVIDER }, "worker: ready");

  onShutdown("queue", () => getQueueProvider().close());
  onShutdown("database", disconnectDatabase);
  onShutdown("cleanup-timer", () => void clearInterval(cleanupTimer));

  void getStorageProvider(); // fail fast on a bad storage config even if no job has run yet
}

let shuttingDown = false;
async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "worker: shutting down");
  await runShutdownHooks();
  process.exit(exitCode);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "worker: unhandled promise rejection");
});

void main();
