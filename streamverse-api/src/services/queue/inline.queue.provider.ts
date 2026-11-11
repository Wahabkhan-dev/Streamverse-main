import { env } from "../../config/env";
import { logger } from "../../config/logger";
import type { JobHandler, QueueProvider } from "./queue.provider";

/**
 * Section 60: an EXPLICIT dev/test fallback — not a silent "oh well, run it synchronously" shortcut.
 * `enqueue` still returns a resolved promise immediately (the caller never waits on job completion,
 * matching the real queue's contract) and the job itself runs on the next tick, with the same per-job
 * error containment a real worker would give it (Section 62/63: a thrown error is logged, not crashed
 * out to the caller of `enqueue`).
 *
 * Jobs of one queue run at most INLINE_QUEUE_CONCURRENCY at a time (default 1); the rest wait their turn. With this driver the
 * API process IS the worker, so five movies uploaded together would otherwise start five ffmpeg conversions at once and starve
 * (or run out of memory for) the server that is answering customers.
 */
export function createInlineQueueProvider(concurrency = env.INLINE_QUEUE_CONCURRENCY): QueueProvider {
  const handlers = new Map<string, JobHandler<unknown>>();
  const waiting = new Map<string, (() => void)[]>();
  const running = new Map<string, number>();

  function pump(queueName: string) {
    const queue = waiting.get(queueName);
    while (queue?.length && (running.get(queueName) ?? 0) < concurrency) {
      running.set(queueName, (running.get(queueName) ?? 0) + 1);
      queue.shift()!();
    }
  }

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
      const job = () =>
        setImmediate(() => {
          void handler(data)
            .catch((err: unknown) => {
              logger.error({ queueName, err }, "inline queue: job handler threw");
            })
            .finally(() => {
              running.set(queueName, (running.get(queueName) ?? 1) - 1);
              pump(queueName);
            });
        });
      if (!waiting.has(queueName)) waiting.set(queueName, []);
      waiting.get(queueName)!.push(job);
      const queued = waiting.get(queueName)!.length;
      if (queued > 1 || (running.get(queueName) ?? 0) >= concurrency) logger.info({ queueName, waiting: queued }, "inline queue: job waiting for a free slot");
      pump(queueName);
    },
    async close() {
      handlers.clear();
      waiting.clear();
    },
  };
}
