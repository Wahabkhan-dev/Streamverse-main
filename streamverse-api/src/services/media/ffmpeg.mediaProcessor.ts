import { execFile, execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { env } from "../../config/env";
import type { AudioStreamInfo, MediaProcessor, ProbeResult, RenditionOutput, RenditionSpec, TranscodeOptions } from "./mediaProcessor.provider";

/**
 * execFile as a promise of { stdout, stderr }. Written out with the callback instead of util.promisify(execFile): under
 * Hostinger's LiteSpeed runner (lsnode) the promisified form resolved without `stdout`, so every probe failed with
 * '"undefined" is not valid JSON' although ffprobe itself had answered.
 */
function run(cmd: string, args: string[], opts: { timeout?: number; maxBuffer?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { ...opts, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }));
      else resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

/** True when `cmd` runs (a system ffmpeg/ffprobe on PATH). */
function runs(cmd: string): boolean {
  try {
    execFileSync(cmd, ["-version"], { stdio: "ignore", timeout: 10_000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** The binary shipped by the ffmpeg-static / ffprobe-static packages, when they are installed and their file exists. */
function bundled(pkg: "ffmpeg-static" | "ffprobe-static"): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(pkg) as string | { path?: string } | null;
    const p = typeof mod === "string" ? mod : mod?.path;
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Which ffmpeg/ffprobe to run, decided once on first use: FFMPEG_PATH/FFPROBE_PATH when set, else the system one on PATH
 * (the Docker image installs it), else the copy bundled with the npm packages (hosts without a system ffmpeg, e.g. Hostinger).
 */
let binaries: { ffmpeg: string; ffprobe: string } | null = null;
function bin(): { ffmpeg: string; ffprobe: string } {
  binaries ??= {
    ffmpeg: env.FFMPEG_PATH ?? (runs("ffmpeg") ? "ffmpeg" : (bundled("ffmpeg-static") ?? "ffmpeg")),
    ffprobe: env.FFPROBE_PATH ?? (runs("ffprobe") ? "ffprobe" : (bundled("ffprobe-static") ?? "ffprobe")),
  };
  return binaries;
}
/**
 * Threads for one conversion. ffmpeg's default is "one per CPU" (x264 even 1.5x), and on Hostinger's CloudLinux the machine
 * reports 64 CPUs while the account may only start a limited number of threads: the scaler and encoder then failed to start
 * ("Resource temporarily unavailable" → libx264 "Invalid argument", nothing written). A small fixed count works everywhere.
 */
export const ffmpegThreads = () => env.FFMPEG_THREADS ?? Math.max(1, Math.min(4, availableParallelism()));
/** ffprobe only reads headers: two minutes is generous even over a slow link. */
const PROBE_TIMEOUT_MS = 2 * 60 * 1000;
/** A conversion that writes nothing at all (no progress, no log) for this long is stuck (e.g. the source stopped sending). */
const FFMPEG_STALL_MS = 10 * 60 * 1000;

/** Section 22/83: fail clearly at worker startup if ffmpeg/ffprobe aren't available — never fall back to pretending. */
export async function assertFfmpegAvailable(): Promise<void> {
  const { ffmpeg, ffprobe } = bin();
  try {
    await run(ffprobe, ["-version"]);
    await run(ffmpeg, ["-version"]);
  } catch {
    throw new Error(`ffmpeg/ffprobe not found (looked for "${ffmpeg}" / "${ffprobe}"). Set FFMPEG_PATH/FFPROBE_PATH or install ffmpeg.`);
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
      // bounded: a source that never answers (or a pathological file) must fail the job, not hold the worker forever
      const { stdout } = await run(bin().ffprobe, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", sourceUrl], { timeout: PROBE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }).catch(
        (err: { code?: number | string; killed?: boolean }) => {
          // the raw error repeats the whole command line, including the signed source link: never store or show that
          if (err.code === "ENOENT") throw new Error("FFmpeg is not installed on the server, so videos and audio cannot be processed. Your file is fine; retry once FFmpeg is installed.");
          throw new Error(err.killed ? "ffprobe timed out reading the file" : `ffprobe could not read the file (exit ${String(err.code ?? "unknown")}) — it may not be a valid video/audio file`);
        },
      );
      let parsed: FfprobeOutput;
      try {
        parsed = JSON.parse(stdout) as FfprobeOutput;
      } catch {
        throw new Error("ffprobe returned no readable details for this file — it may not be a valid video/audio file");
      }
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

    async transcodeRendition(sourceUrl: string, spec: RenditionSpec, opts: TranscodeOptions = {}): Promise<RenditionOutput> {
      const dir = await mkdtemp(path.join(tmpdir(), "sv-hls-"));
      const playlistPath = path.join(dir, `${spec.name}.m3u8`);
      const duration = opts.durationSeconds && opts.durationSeconds > 0 ? opts.durationSeconds : null;
      const onTime = duration && opts.onProgress ? (seconds: number) => opts.onProgress!(Math.min(1, seconds / duration)) : undefined;
      const dispose = () => rm(dir, { recursive: true, force: true });
      const threads = String(ffmpegThreads());
      try {
        await runFfmpeg([
          // machine-readable "how far" lines on stdout; the human log stays on stderr for the error message
          "-progress",
          "pipe:1",
          "-nostats",
          "-filter_threads",
          threads,
          "-i",
          sourceUrl,
          "-threads",
          threads,
          // h264 needs even dimensions: a 1920x1080 source scaled into 854x480 would otherwise become 853x480 and fail to encode
          "-vf",
          `scale=w=${spec.width}:h=${spec.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
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
        ], onTime);
        const files = await readdir(dir);
        const segmentFiles = files.filter((f) => f.endsWith(".ts")).sort();
        const playlist = await readFile(playlistPath);
        // Segments stay on disk and are read one at a time by the caller (a feature film's rendition is gigabytes); the caller
        // removes the folder with dispose() once they are uploaded.
        const segments = segmentFiles.map((name) => ({ name, read: () => readFile(path.join(dir, name)) }));
        return { spec, playlist, segments, dispose };
      } catch (err) {
        await dispose();
        throw err;
      }
    },
  };
}

/**
 * Runs ffmpeg, reporting the position it has reached (seconds of source) from its `-progress` output. On failure the
 * error carries the last lines ffmpeg wrote, which say what went wrong; the start of its log is only the version banner.
 */
function runFfmpeg(args: string[], onTime?: (seconds: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin().ffmpeg, args, { windowsHide: true });
    let pending = "";
    let log = "";
    let stalled = false;
    let watchdog: NodeJS.Timeout | undefined;
    const alive = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        stalled = true;
        child.kill("SIGKILL");
      }, FFMPEG_STALL_MS);
      watchdog.unref();
    };
    alive();
    child.stdout.on("data", (chunk: Buffer) => {
      alive();
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        // out_time_ms is microseconds too, despite its name
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m && onTime) onTime(Number(m[1]) / 1_000_000);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      alive();
      log = (log + chunk.toString()).slice(-8000);
    });
    child.on("error", (err) => {
      clearTimeout(watchdog);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(watchdog);
      if (stalled) return reject(new Error(`ffmpeg made no progress for ${FFMPEG_STALL_MS / 60000} minutes and was stopped`));
      if (code === 0) return resolve();
      const last = redactUrls(log.trim().split(/\r?\n/).slice(-6).join(" | "));
      reject(new Error(`ffmpeg stopped with code ${code}: ${last}`));
    });
  });
}

/** ffmpeg's log names its input, which is a signed storage link: replace any link before the text is stored or shown. */
export const redactUrls = (text: string) => text.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"|]+/gi, "<source>");

function evalFrameRate(raw: string): number | null {
  const [num, den] = raw.split("/").map(Number);
  if (!num || !den) return null;
  return Math.round((num / den) * 100) / 100;
}
