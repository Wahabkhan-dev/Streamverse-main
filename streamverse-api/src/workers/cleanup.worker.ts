import { getQueueProvider, QUEUE_NAMES } from "../services/queue";
import { runMediaCleanup } from "../services/media/mediaCleanup.service";
import { reconcileBatch } from "../services/media/reconciliation.service";
import { logger } from "../config/logger";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function registerCleanupWorker(): void {
  getQueueProvider().registerProcessor<Record<string, never>>(QUEUE_NAMES.MEDIA_CLEANUP, async () => {
    await runMediaCleanup();
    const { markedMissing } = await reconcileBatch();
    if (markedMissing > 0) logger.warn({ markedMissing }, "media: reconciliation found missing objects");
  });
}

/** Section 46/92: the queue has no built-in scheduler in either driver here, so this process's own
 * interval is what fires the recurring cleanup/reconciliation job (Section 59: still goes through the
 * queue, not run inline on the timer itself). */
export function scheduleMediaCleanup(): NodeJS.Timeout {
  const timer = setInterval(() => void getQueueProvider().enqueue(QUEUE_NAMES.MEDIA_CLEANUP, {}), CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}
