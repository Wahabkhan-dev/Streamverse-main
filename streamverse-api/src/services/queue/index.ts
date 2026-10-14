import { env } from "../../config/env";
import { createBullMqQueueProvider } from "./bullmq.queue.provider";
import { createInlineQueueProvider } from "./inline.queue.provider";
import type { QueueProvider } from "./queue.provider";

export { QUEUE_NAMES, type QueueName } from "./queue.provider";
export type { QueueProvider } from "./queue.provider";

let instance: QueueProvider | undefined;

export function getQueueProvider(): QueueProvider {
  instance ??= env.QUEUE_DRIVER === "bullmq" ? createBullMqQueueProvider() : createInlineQueueProvider();
  return instance;
}
