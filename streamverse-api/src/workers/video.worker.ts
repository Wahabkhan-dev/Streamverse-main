import { getQueueProvider, QUEUE_NAMES } from "../services/queue";
import { processVideoAsset } from "../services/media/videoProcessing.service";

interface VideoJob {
  assetId: string;
}

export function registerVideoWorker(): void {
  getQueueProvider().registerProcessor<VideoJob>(QUEUE_NAMES.VIDEO_PROCESSING, async ({ assetId }) => {
    await processVideoAsset(assetId);
  });
}
