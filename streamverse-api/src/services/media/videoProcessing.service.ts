import type { Prisma } from "@prisma/client";
import * as mediaAssetRepository from "../../repositories/mediaAsset.repository";
import { logger } from "../../config/logger";
import { getMediaProcessor } from ".";
import { selectRenditions, type RenditionSpec } from "./mediaProcessor.provider";
import { masterPlaylistKey, renditionPlaylistKey, renditionSegmentKey } from "./storageKey.service";
import { getStorageProvider } from "../storage";

const PROCESSING_URL_TTL_SECONDS = 60 * 60; // long enough for ffmpeg to read the whole source once

function buildMasterPlaylist(specs: RenditionSpec[]): string {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const spec of specs) lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${spec.bitrate},RESOLUTION=${spec.width}x${spec.height}`, `${spec.name}/${spec.name}.m3u8`);
  return lines.join("\n") + "\n";
}

function sanitizeError(err: unknown): string {
  // Section 74: never log/store a secret — an ffmpeg error can echo back the signed source URL verbatim.
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/https?:\/\/\S+/g, "[redacted-url]").slice(0, 1000);
}

const PROGRESS_WRITE_MS = 2000;

/**
 * Keeps `metadata.progress` on the asset row up to date while it is processed, at most every 2 s (or at once when the
 * step changes). Writes run one after another, and `settle` waits for the last, so a late write can never land on top
 * of the final READY/FAILED update. The final READY update replaces `metadata`, which drops the progress with it.
 */
function progressWriter(assetId: string) {
  const startedAt = new Date().toISOString();
  let lastAt = 0;
  let lastPercent = -1;
  let lastStep = "";
  let chain: Promise<unknown> = Promise.resolve();
  return {
    write(percent: number, step: string) {
      const pct = Math.max(0, Math.min(99, Math.floor(percent)));
      const now = Date.now();
      if (step === lastStep && (pct === lastPercent || now - lastAt < PROGRESS_WRITE_MS)) return;
      lastAt = now;
      lastPercent = pct;
      lastStep = step;
      const progress = { percent: pct, step, startedAt };
      chain = chain.then(() => mediaAssetRepository.update(assetId, { metadata: { progress } as unknown as Prisma.InputJsonValue })).catch(() => undefined);
    },
    settle: () => chain,
  };
}

/**
 * Section 21/24/25/29: runs off the queue, never inside an HTTP request. Idempotent — if the asset isn't
 * (still) UPLOADED (or FAILED, on a queue retry) when this runs, it's either already done or mid-flight from another delivery of the
 * same job, so it no-ops rather than generating duplicate HLS output.
 */
export async function processVideoAsset(assetId: string): Promise<void> {
  const asset = await mediaAssetRepository.findById(assetId);
  if (!asset || (asset.status !== "UPLOADED" && asset.status !== "FAILED") || !asset.storageKey) return;

  await mediaAssetRepository.update(assetId, { status: "PROCESSING" });
  // A retry may be re-running this after a partial previous attempt — clear any renditions it already made.
  for (const old of await mediaAssetRepository.listRenditions(assetId)) await mediaAssetRepository.hardDelete(old.id).catch(() => undefined);

  const storage = getStorageProvider();
  const processor = getMediaProcessor();
  const progress = progressWriter(assetId);

  try {
    progress.write(0, "Reading the video");
    const sourceUrl = await storage.createDownloadUrl(asset.storageKey, PROCESSING_URL_TTL_SECONDS);
    const probe = await processor.probe(sourceUrl);
    if (!probe.width || !probe.height) throw new Error("Could not determine the source video's dimensions");

    const specs = selectRenditions(probe.width, probe.height); // Section 24: never upscales past the source
    if (specs.length === 0) throw new Error("Source resolution too small for any configured rendition");

    // each rendition gets an equal share of the bar: most of it for converting, the rest for saving its pieces to storage
    const at = (index: number, within: number) => 1 + (98 * (index + within)) / specs.length;
    for (const [i, spec] of specs.entries()) {
      const of = `${i + 1} of ${specs.length}`;
      progress.write(at(i, 0), `Converting to ${spec.name} (${of})`);
      const output = await processor.transcodeRendition(sourceUrl, spec, {
        durationSeconds: probe.durationSeconds,
        onProgress: (f) => progress.write(at(i, 0.85 * f), `Converting to ${spec.name} (${of})`),
      });
      const playlistKey = renditionPlaylistKey(asset.storageKey, spec.name);
      await storage.putObject(playlistKey, output.playlist, "application/vnd.apple.mpegurl");
      for (const [j, segment] of output.segments.entries()) {
        await storage.putObject(renditionSegmentKey(asset.storageKey, spec.name, segment.name), segment.data, "video/mp2t");
        progress.write(at(i, 0.85 + (0.15 * (j + 1)) / output.segments.length), `Saving ${spec.name} to storage (${of})`);
      }
      await mediaAssetRepository.create({
        contentId: asset.contentId,
        type: asset.type,
        storageKey: playlistKey,
        sourceAssetId: asset.id,
        variant: spec.name,
        bitrate: spec.bitrate,
        resolution: `${spec.width}x${spec.height}`,
        codec: "h264",
        status: "READY",
      });
    }

    const manifestKey = masterPlaylistKey(asset.storageKey);
    await storage.putObject(manifestKey, Buffer.from(buildMasterPlaylist(specs)), "application/vnd.apple.mpegurl");

    await progress.settle();
    await mediaAssetRepository.update(assetId, {
      status: "READY",
      durationSeconds: probe.durationSeconds ?? null,
      width: probe.width,
      height: probe.height,
      codec: probe.codec ?? null,
      bitrate: probe.bitrate ?? null,
      resolution: `${probe.width}x${probe.height}`,
      hlsManifestKey: manifestKey,
      metadata: { frameRate: probe.frameRate ?? null, audioStreams: probe.audioStreams ?? [], renditions: specs.map((s) => s.name) } as unknown as Prisma.InputJsonValue,
      processingError: null,
    });
    logger.info({ assetId, renditions: specs.map((s) => s.name) }, "media: video processing complete");
  } catch (err) {
    await progress.settle();
    await mediaAssetRepository.update(assetId, { status: "FAILED", processingError: sanitizeError(err) });
    logger.error({ assetId, err: sanitizeError(err) }, "media: video processing failed");
    // Rethrow so the queue sees a failed job and applies its retry/backoff policy instead of "completed".
    throw err;
  }
}
