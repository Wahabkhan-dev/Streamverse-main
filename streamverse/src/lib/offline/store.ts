import { useSyncExternalStore } from "react";

/** What the Downloads screen and the offline player need to know about one saved title. */
export interface DownloadRecord {
  contentId: string;
  slug: string;
  type: "MOVIE" | "EBOOK" | "AUDIOBOOK";
  title: string;
  /** whose download it is: nobody else on this device can open it */
  userId: string;
  status: "downloading" | "ready" | "partial";
  /** 0..1 */
  progress: number;
  bytes: number;
  downloadedAt: string;
  /** the entitlement runs out then; renewed whenever the device is online and still entitled */
  expiresAt: string;
  /** the title's detail payload exactly as the API returned it, so its pages open offline */
  meta: unknown;
  /** local address of the cover, for the Downloads screen */
  posterUrl: string | null;
  /** how the player should open it */
  playback: OfflinePlayback;
  error?: string;
}

export type OfflinePlayback =
  | { kind: "movie"; playlist: string }
  | { kind: "ebook"; file: string; fileType: "epub" | "pdf" }
  | { kind: "audiobook-single"; file: string }
  | { kind: "audiobook-chapters"; chapters: Array<{ chapterNumber: number; title: string; file: string }> };

const KEY = "sv-downloads-v1";
let records: Record<string, DownloadRecord> = read();
const listeners = new Set<() => void>();

function read(): Record<string, DownloadRecord> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, DownloadRecord>;
  } catch {
    return {};
  }
}

function emit() {
  records = { ...records };
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    /* storage full: the records stay in memory for this visit */
  }
  listeners.forEach((l) => l());
}

export const putRecord = (r: DownloadRecord) => {
  records[r.contentId] = r;
  emit();
};
export const patchRecord = (contentId: string, patch: Partial<DownloadRecord>) => {
  const cur = records[contentId];
  if (!cur) return;
  records[contentId] = { ...cur, ...patch };
  emit();
};
export const deleteRecord = (contentId: string) => {
  delete records[contentId];
  emit();
};
export const clearRecords = () => {
  records = {};
  emit();
};
export const getRecord = (contentId: string): DownloadRecord | undefined => records[contentId];
export const allRecords = (): DownloadRecord[] => Object.values(records);
export const findBySlug = (slug: string): DownloadRecord | undefined => allRecords().find((r) => r.slug === slug);
export const findByIdOrSlug = (idOrSlug: string): DownloadRecord | undefined => records[idOrSlug] ?? findBySlug(idOrSlug);

/** Usable right now by this customer: finished, not expired, and downloaded by them. */
export const isUsable = (r: DownloadRecord | undefined, userId: string | undefined): r is DownloadRecord =>
  !!r && r.status === "ready" && !!userId && r.userId === userId && Date.parse(r.expiresAt) > Date.now();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      records = read();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: Record<string, DownloadRecord> = {};
export const useDownloadRecords = (): DownloadRecord[] => {
  const snapshot = useSyncExternalStore(subscribe, () => records, () => EMPTY);
  return Object.values(snapshot);
};
export const useDownloadRecord = (idOrSlug: string | undefined): DownloadRecord | undefined => {
  const snapshot = useSyncExternalStore(subscribe, () => records, () => EMPTY);
  return idOrSlug ? (snapshot[idOrSlug] ?? Object.values(snapshot).find((r) => r.slug === idOrSlug)) : undefined;
};
