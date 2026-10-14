import * as mediaAssetRepository from "../../repositories/mediaAsset.repository";
import { logger } from "../../config/logger";
import { getMediaProcessor } from ".";
import { getStorageProvider } from "../storage";

const PROBE_URL_TTL_SECONDS = 15 * 60;

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/https?:\/\/\S+/g, "[redacted-url]").slice(0, 1000);
}

/**
 * Section 30/31: metadata extraction only — no renditions, no transcoding (audiobooks/audio tracks are
 * delivered as the single uploaded file). If duration/codec can't be determined, those fields are left
 * null; nothing here invents a fallback value (Section 31: never "8h" as a placeholder).
 */
export async function processAudioAsset(assetId: string): Promise<void> {
  const asset = await mediaAssetRepository.findById(assetId);
  if (!asset || asset.status !== "UPLOADED" || !asset.storageKey) return;

  await mediaAssetRepository.update(assetId, { status: "PROCESSING" });
  const storage = getStorageProvider();
  const processor = getMediaProcessor();

  try {
    const sourceUrl = await storage.createDownloadUrl(asset.storageKey, PROBE_URL_TTL_SECONDS);
    const probe = await processor.probe(sourceUrl);
    const primaryAudio = probe.audioStreams?.[0];

    await mediaAssetRepository.update(assetId, {
      status: "READY",
      durationSeconds: probe.durationSeconds ?? null, // null stays null — never a guessed fallback
      codec: primaryAudio?.codec ?? probe.codec ?? null,
      bitrate: probe.bitrate ?? null,
      metadata: { channels: primaryAudio?.channels ?? null, sampleRateHz: primaryAudio?.sampleRateHz ?? null },
      processingError: null,
    });
    logger.info({ assetId, durationSeconds: probe.durationSeconds }, "media: audio processing complete");
  } catch (err) {
    // Section 31: extraction failing is not fatal to the upload — leave duration null, mark the error, let Admin retry.
    await mediaAssetRepository.update(assetId, { status: "FAILED", processingError: sanitizeError(err) });
    logger.error({ assetId, err: sanitizeError(err) }, "media: audio processing failed");
  }
}
