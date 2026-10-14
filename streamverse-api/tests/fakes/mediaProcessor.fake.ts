import type { MediaProcessor, ProbeResult, RenditionOutput, RenditionSpec } from "../../src/services/media/mediaProcessor.provider";

/**
 * Stands in for ffmpeg/ffprobe (this sandbox has no ffmpeg binary) — the same substitution pattern as
 * `tests/fakePrisma.ts` for Postgres. `probeOverride`/`shouldFail` let a test drive a specific scenario
 * (e.g. "duration cannot be determined", "processing fails") without touching a real file.
 */
export function createFakeMediaProcessor(opts: { probe?: Partial<ProbeResult>; failProbe?: boolean; failTranscode?: boolean } = {}): MediaProcessor {
  return {
    async probe(_sourceUrl: string): Promise<ProbeResult> {
      if (opts.failProbe) throw new Error("fake ffprobe failure");
      return {
        durationSeconds: 120,
        width: 1920,
        height: 1080,
        codec: "h264",
        frameRate: 24,
        bitrate: 5_000_000,
        audioStreams: [{ codec: "aac", channels: 2, sampleRateHz: 48000 }],
        ...opts.probe,
      };
    },
    async transcodeRendition(_sourceUrl: string, spec: RenditionSpec): Promise<RenditionOutput> {
      if (opts.failTranscode) throw new Error("fake ffmpeg failure");
      return {
        spec,
        playlist: Buffer.from(`#EXTM3U\n#EXT-X-VERSION:3\n${spec.name}_000.ts\n#EXT-X-ENDLIST\n`),
        segments: [{ name: `${spec.name}_000.ts`, data: Buffer.from("fake-segment-data") }],
      };
    },
  };
}
