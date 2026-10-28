import { useSyncExternalStore } from "react";

/** What the corner mini player is playing: handed over by the full player when the viewer presses "i". */
export interface MiniPlayback {
  slug: string;
  title: string;
  contentId: string;
  src: string;
  /** seconds into the video where the full player was */
  startAt: number;
  volume: number;
  muted: boolean;
  /** the stream slot the full player held; the mini player keeps it alive and gives it back when it closes */
  sessionId: string | null;
  trailer?: "official" | "teaser" | "bts";
}

let current: MiniPlayback | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openMini(p: MiniPlayback) {
  current = p;
  emit();
}
export function closeMini() {
  if (!current) return;
  current = null;
  emit();
}
export const useMini = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
