import { useEffect, useState } from "react";

/**
 * Keeps uploaded media files in this browser (IndexedDB) so the player can play what the admin uploaded.
 * Frontend phase only: a real backend will store and stream these instead. The in-memory copy means
 * a file still plays in the current session if the browser refuses to keep it.
 */
const DB = "sv-media";
const STORE = "files";
const mem = new Map<string, Blob>();

const hasIdb = () => typeof indexedDB !== "undefined";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((res, rej) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } finally {
    db.close();
  }
}

/** Resolves false when the browser could not keep the file across a refresh. */
export async function saveFile(key: string, file: Blob): Promise<boolean> {
  mem.set(key, file);
  if (!hasIdb()) return true;
  try {
    await tx("readwrite", (s) => s.put(file, key));
    return true;
  } catch {
    return false;
  }
}

export async function loadFile(key: string): Promise<Blob | null> {
  const hit = mem.get(key);
  if (hit) return hit;
  if (!hasIdb()) return null;
  try {
    return ((await tx("readonly", (s) => s.get(key))) as Blob | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  mem.delete(key);
  if (!hasIdb()) return;
  try {
    await tx("readwrite", (s) => s.delete(key));
  } catch {
    /* nothing to remove */
  }
}

/** Moves a file from a draft's key to the published title's key. Does nothing when there is no such file. */
export async function moveFile(from: string, to: string): Promise<void> {
  const blob = await loadFile(from);
  if (!blob) return;
  await saveFile(to, blob);
  await deleteFile(from);
}

export const draftFileKey = (draftId: string, slot: string) => `draft:${draftId}:${slot}`;
export const movieFileKey = (slug: string, slot: string) => `movie:${slug}:${slot}`;

/** An object URL for a stored file, or null when there isn't one. */
export function useStoredFileUrl(key: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!key || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return undefined;
    }
    let alive = true;
    let made: string | null = null;
    void loadFile(key).then((b) => {
      if (!alive || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key]);
  return url;
}
