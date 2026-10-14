import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../../config/env";
import type { AudioStreamInfo, MediaProcessor, ProbeResult, RenditionOutput, RenditionSpec } from "./mediaProcessor.provider";

const run = promisify(execFile);
const FFMPEG = env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = env.FFPROBE_PATH ?? "ffprobe";

/** Section 22/83: fail clearly at worker startup if ffmpeg/ffprobe aren't available — never fall back to pretending. */
export async function assertFfmpegAvailable(): Promise<void> {
  try {
    await run(FFPROBE, ["-version"]);
    await run(FFMPEG, ["-version"]);
  } catch {
    throw new Error(`ffmpeg/ffprobe not found (looked for "${FFMPEG}" / "${FFPROBE}" on PATH). Set FFMPEG_PATH/FFPROBE_PATH or install ffmpeg.`);
  }
}

interface FfprobeStream {
  codec_type: "video" | "audio" | "subtitle" | "data";
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  channels?: number;
  sample_rate?: string;
  bit_rate?: string;
}
interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; bit_rate?: string };
}

export function createFfmpegMediaProcessor(): MediaProcessor {
  return {
    async probe(sourceUrl: string): Promise<ProbeResult> {
      const { stdout } = await run(FFPROBE, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", sourceUrl]);
      const parsed = JSON.parse(stdout) as FfprobeOutput;
      const video = parsed.streams?.find((s) => s.codec_type === "video");
      const audioStreams: AudioStreamInfo[] = (parsed.streams ?? [])
        .filter((s) => s.codec_type === "audio")
        .map((s) => ({ codec: s.codec_name ?? "unknown", channels: s.channels ?? 0, sampleRateHz: Number(s.sample_rate ?? 0) }));

      const duration = parsed.format?.duration ? Number(parsed.format.duration) : null;
      const frameRate = video?.avg_frame_rate ? evalFrameRate(video.avg_frame_rate) : null;
      return {
        durationSeconds: duration !== null && Number.isFinite(duration) ? Math.round(duration) : null,
        width: video?.width ?? null,
        height: video?.height ?? null,
        codec: video?.codec_name ?? audioStreams[0]?.codec ?? null,
        frameRate,
        bitrate: parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : null,
        audioStreams,
      };
    },

    async transcodeRendition(sourceUrl: string, spec: RenditionSpec): Promise<RenditionOutput> {
      const dir = await mkdtemp(path.join(tmpdir(), "sv-hls-"));
      const playlistPath = path.join(dir, `${spec.name}.m3u8`);
      try {
        await run(FFMPEG, [
          "-i",
          sourceUrl,
          "-vf",
          `scale=w=${spec.width}:h=${spec.height}:force_original_aspect_ratio=decrease`,
          "-c:v",
          "h264",
          "-b:v",
          String(spec.bitrate),
          "-c:a",
          "aac",
          "-hls_time",
          "6",
          "-hls_playlist_type",
          "vod",
          "-hls_segment_filename",
          path.join(dir, `${spec.name}_%03d.ts`),
          playlistPath,
        ]);
        const files = await readdir(dir);
        const segmentFiles = files.filter((f) => f.endsWith(".ts"));
        const playlist = await readFile(playlistPath);
        const segments = await Promise.all(segmentFiles.map(async (name) => ({ name, data: await readFile(path.join(dir, name)) })));
        return { spec, playlist, segments };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

function evalFrameRate(raw: string): number | null {
  const [num, den] = raw.split("/").map(Number);
  if (!num || !den) return null;
  return Math.round((num / den) * 100) / 100;
}
