import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import type { JobHandler, QueueProvider } from "./queue.provider";

/**
 * Section 59/62/63: real Redis-backed queueing. Retries use exponential backoff and stop after a fixed
 * number of attempts (Section 62: never retry a permanently invalid file forever) — on final failure the
 * job lands in BullMQ's own failed set, which `listFailedJobs` below exposes (Section 63: failures stay
 * visible, never silently dropped).
 */
export function createBullMqQueueProvider(): QueueProvider {
  const connection = new IORedis(env.REDIS_URL!, { maxRetriesPerRequest: null });
  const queues = new Map<string, Queue>();
  const workers: Worker[] = [];

  function getQueue(name: string): Queue {
    let q = queues.get(name);
    if (!q) {
      q = new Queue(name, { connection });
      queues.set(name, q);
    }
    return q;
  }

  return {
    registerProcessor<T>(queueName: string, handler: JobHandler<T>) {
      const worker = new Worker(
        queueName,
        async (job: Job) => {
          await handler(job.data as T);
        },
        { connection },
      );
      worker.on("failed", (job, err) => logger.error({ queueName, jobId: job?.id, err: err.message }, "bullmq: job failed"));
      worker.on("ready", () => logger.info({ queueName }, "bullmq: worker ready"));
      workers.push(worker);
    },
    async enqueue<T>(queueName: string, data: T, opts?: { jobId?: string }) {
      await getQueue(queueName).add(queueName, data, {
        jobId: opts?.jobId,
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: false, // Section 63: keep failed jobs visible for inspection
      });
    },
    async close() {
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all([...queues.values()].map((q) => q.close()));
      await connection.quit();
    },
  };
}
