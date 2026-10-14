/** Phase 6 (Section 59/61): job payloads are IDs only — never file buffers (Section 61). */
export type JobHandler<T> = (data: T) => Promise<void>;

export interface QueueProvider {
  /** Registers the function that runs a job for this queue — called once per queue name at startup. */
  registerProcessor<T>(queueName: string, handler: JobHandler<T>): void;
  /** Enqueues one job. Never resolves by running the job inline unless the configured driver is "inline". */
  enqueue<T>(queueName: string, data: T, opts?: { jobId?: string }): Promise<void>;
  close(): Promise<void>;
}

export const QUEUE_NAMES = {
  VIDEO_PROCESSING: "video-processing",
  AUDIO_PROCESSING: "audio-processing",
  MEDIA_CLEANUP: "media-cleanup",
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
