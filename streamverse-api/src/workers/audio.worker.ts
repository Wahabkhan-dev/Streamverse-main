import { getQueueProvider, QUEUE_NAMES } from "../services/queue";
import { processAudioAsset } from "../services/media/audioProcessing.service";

interface AudioJob {
  assetId: string;
}

export function registerAudioWorker(): void {
  getQueueProvider().registerProcessor<AudioJob>(QUEUE_NAMES.AUDIO_PROCESSING, async ({ assetId }) => {
    await processAudioAsset(assetId);
  });
}
