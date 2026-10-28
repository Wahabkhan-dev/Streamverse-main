/** What the admin screens show while a file waits for or goes through processing. */
export interface ProcessingProgress {
  percent: number;
  step: string;
  startedAt: string | null;
  etaSeconds: number | null;
}

/**
 * Reads back the `metadata.progress` that video processing keeps on the asset row, for an API response. Null once the
 * file is ready or failed, and for files that are never processed.
 */
export function processingProgressOf(asset: { status: string; metadata?: unknown }): ProcessingProgress | null {
  // uploaded and queued: the queue converts one file at a time, so this one waits for those before it
  if (asset.status === "UPLOADED") return { percent: 0, step: "Waiting for its turn", startedAt: null, etaSeconds: null };
  if (asset.status !== "PROCESSING") return null;
  const p = (asset.metadata as { progress?: { percent?: number; step?: string; startedAt?: string } } | null)?.progress;
  if (!p) return { percent: 0, step: "Starting", startedAt: null, etaSeconds: null };
  const percent = p.percent ?? 0;
  const elapsed = p.startedAt ? (Date.now() - Date.parse(p.startedAt)) / 1000 : 0;
  // the time left is guessed from the speed so far, so it is only given once there is enough of it to go on
  const etaSeconds = percent >= 3 && elapsed > 0 ? Math.round((elapsed * (100 - percent)) / percent) : null;
  return { percent, step: p.step ?? "Working", startedAt: p.startedAt ?? null, etaSeconds };
}
