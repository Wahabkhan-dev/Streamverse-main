/**
 * Phase 6 (Section 36/37/79): parses just enough of a VTT/SRT file to reject something unusable —
 * malformed timestamps, an empty file, or an encoding that doesn't decode as text. Never renders the
 * text as HTML (Section 79) — this only validates structure, and callers treat every cue's text as
 * plain, untrusted text.
 */
export interface CaptionValidationResult {
  valid: boolean;
  reason?: string;
  format?: "vtt" | "srt";
  cueCount?: number;
}

const VTT_TIMESTAMP = /\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/;
const SRT_TIMESTAMP = /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/;

export function validateCaptionFile(buf: Buffer): CaptionValidationResult {
  let text: string;
  try {
    text = buf.toString("utf8");
    if (text.includes("�")) return { valid: false, reason: "File is not valid UTF-8 text" };
  } catch {
    return { valid: false, reason: "File is not valid UTF-8 text" };
  }

  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: "Caption file is empty" };

  if (trimmed.startsWith("WEBVTT")) {
    const cues = trimmed.match(new RegExp(VTT_TIMESTAMP, "g"));
    if (!cues || cues.length === 0) return { valid: false, reason: "No valid cue timestamps found in VTT file" };
    return { valid: true, format: "vtt", cueCount: cues.length };
  }

  const srtCues = trimmed.match(new RegExp(SRT_TIMESTAMP, "g"));
  if (srtCues && srtCues.length > 0) return { valid: true, format: "srt", cueCount: srtCues.length };

  return { valid: false, reason: "Unrecognized caption format (expected WEBVTT or SRT timestamps)" };
}

/** Section 36: prefer VTT for web playback — a trivial SRT→VTT conversion (timestamp comma→dot, header added). */
export function convertSrtToVtt(srtText: string): string {
  const body = srtText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}
