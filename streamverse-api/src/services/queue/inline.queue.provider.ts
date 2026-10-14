import { logger } from "../../config/logger";
import type { JobHandler, QueueProvider } from "./queue.provider";

/**
 * Section 60: an EXPLICIT dev/test fallback — not a silent "oh well, run it synchronously" shortcut.
 * `enqueue` still returns a resolved promise immediately (the caller never waits on job completion,
 * matching the real queue's contract) and the job itself runs on the next tick, with the same per-job
 * error containment a real worker would give it (Section 62/63: a thrown error is logged, not crashed
 * out to the caller of `enqueue`).
 */
export function createInlineQueueProvider(): QueueProvider {
  const handlers = new Map<string, JobHandler<unknown>>();

  return {
    registerProcessor<T>(queueName: string, handler: JobHandler<T>) {
      handlers.set(queueName, handler as JobHandler<unknown>);
    },
    async enqueue<T>(queueName: string, data: T) {
      const handler = handlers.get(queueName);
      if (!handler) {
        logger.warn({ queueName }, "inline queue: no processor registered for this queue");
        return;
      }
      setImmediate(() => {
        void handler(data).catch((err: unknown) => {
          logger.error({ queueName, err }, "inline queue: job handler threw");
        });
      });
    },
    async close() {
      handlers.clear();
    },
  };
}
