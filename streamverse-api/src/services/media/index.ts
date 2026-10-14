import { createFfmpegMediaProcessor } from "./ffmpeg.mediaProcessor";
import type { MediaProcessor } from "./mediaProcessor.provider";

export * from "./mediaProcessor.provider";

let instance: MediaProcessor | undefined;

/** The one place a worker gets a `MediaProcessor` — tests `vi.mock` this module to inject a fake. */
export function getMediaProcessor(): MediaProcessor {
  instance ??= createFfmpegMediaProcessor();
  return instance;
}
