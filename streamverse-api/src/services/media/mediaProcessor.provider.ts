/**
 * Phase 6 (Section 22/23/30): the one seam between "we need ffmpeg/ffprobe" and everything that uses
 * media metadata/transcoding. `videoProcessing.service.ts`/`audioProcessing.service.ts` only ever talk
 * to this interface — tests inject a fake the same way `tests/fakePrisma.ts` stands in for Postgres,
 * since this sandbox has no ffmpeg binary either.
 */
export interface AudioStreamInfo {
  codec: string;
  channels: number;
  sampleRateHz: number;
}

export interface ProbeResult {
  durationSeconds: number | null;
  width?: number | null;
  height?: number | null;
  codec?: string | null;
  frameRate?: number | null;
  bitrate?: number | null;
  audioStreams?: AudioStreamInfo[];
}

export interface RenditionSpec {
  name: string; // "480p" | "720p" | "1080p" | "4K"
  width: number;
  height: number;
  bitrate: number;
}

export interface RenditionOutput {
  spec: RenditionSpec;
  playlist: Buffer; // this rendition's own .m3u8
  segments: { name: string; data: Buffer }[];
}

export interface TranscodeOptions {
  /** The source length from the probe; without it no fraction can be worked out and `onProgress` is never called. */
  durationSeconds?: number | null;
  /** 0..1 of the source converted so far. */
  onProgress?: (fraction: number) => void;
}

export interface MediaProcessor {
  /** Works against a URL (signed download URL), never a full in-memory buffer (Section 58/61). */
  probe(sourceUrl: string): Promise<ProbeResult>;
  transcodeRendition(sourceUrl: string, spec: RenditionSpec, opts?: TranscodeOptions): Promise<RenditionOutput>;
}

/** Section 24: never upscale — only generate renditions the source can actually support. */
const ALL_RENDITIONS: RenditionSpec[] = [
  { name: "480p", width: 854, height: 480, bitrate: 1_400_000 },
  { name: "720p", width: 1280, height: 720, bitrate: 2_800_000 },
  { name: "1080p", width: 1920, height: 1080, bitrate: 5_000_000 },
  { name: "4K", width: 3840, height: 2160, bitrate: 16_000_000 },
];

export function selectRenditions(sourceWidth: number, sourceHeight: number): RenditionSpec[] {
  const sourcePixels = sourceWidth * sourceHeight;
  return ALL_RENDITIONS.filter((r) => r.width * r.height <= sourcePixels * 1.05); // 5% slack for off-by-a-hair sources
}
