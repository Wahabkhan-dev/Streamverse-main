import { useCallback, useRef, useState } from "react";
import { startLibraryUpload, type UploadHandle, type UploadStage } from "@/api/mediaLibrary.api";

export interface QueuedUpload {
  key: string;
  file: File;
  stage: UploadStage;
  progress: number; // 0..1
  assetId?: string;
  error?: string;
}

const CONCURRENCY = 3;
const LIVE: UploadStage[] = ["preparing", "uploading", "verifying", "processing"];
let seq = 0;

/**
 * A small client-side upload queue: several files at once (3 in flight), per-file and overall progress, retry and cancel.
 * Every file goes through the one backend upload flow (presign -> storage -> verify -> process).
 */
export function useUploadQueue(onFileReady?: (assetId: string, file: File) => void) {
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const handles = useRef(new Map<string, UploadHandle>());
  const itemsRef = useRef<QueuedUpload[]>([]);
  const readyCb = useRef(onFileReady);
  readyCb.current = onFileReady;

  const commit = useCallback((next: QueuedUpload[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);
  const patch = useCallback(
    (key: string, p: Partial<QueuedUpload>) =>
      commit(itemsRef.current.map((i) => (i.key === key ? { ...i, ...p } : i))),
    [commit],
  );

  const pump = useCallback(() => {
    let running = itemsRef.current.filter((i) => LIVE.includes(i.stage)).length;
    for (const next of itemsRef.current.filter((i) => i.stage === "queued")) {
      if (running >= CONCURRENCY) break;
      running++;
      // mark first so a re-entrant pump never starts the same file twice
      patch(next.key, { stage: "preparing" });
      const handle = startLibraryUpload(next.file, {
        onStage: (stage, assetId) => patch(next.key, { stage, ...(assetId ? { assetId } : {}) }),
        onProgress: (progress) => patch(next.key, { progress }),
      });
      handles.current.set(next.key, handle);
      handle.done
        .then((id) => readyCb.current?.(id, next.file))
        .catch((err: Error) => patch(next.key, { error: err.message }))
        .finally(() => {
          handles.current.delete(next.key);
          setTimeout(pump, 0);
        });
    }
  }, [patch]);

  const add = useCallback(
    (files: File[]) => {
      commit([
        ...itemsRef.current,
        ...files.map((file): QueuedUpload => ({
          key: `u${++seq}`,
          file,
          stage: "queued",
          progress: 0,
        })),
      ]);
      pump();
    },
    [commit, pump],
  );

  const cancel = useCallback(
    (key: string) => {
      const h = handles.current.get(key);
      if (h) h.cancel();
      else patch(key, { stage: "cancelled", error: "Upload cancelled." });
    },
    [patch],
  );

  const retry = useCallback(
    (key: string) => {
      patch(key, { stage: "queued", progress: 0 });
      pump();
    },
    [patch, pump],
  );

  const remove = useCallback(
    (key: string) => commit(itemsRef.current.filter((i) => i.key !== key)),
    [commit],
  );
  const clearFinished = useCallback(
    () => commit(itemsRef.current.filter((i) => !["ready", "cancelled"].includes(i.stage))),
    [commit],
  );

  const totalBytes = items.reduce((n, i) => n + i.file.size, 0);
  const doneBytes = items.reduce(
    (n, i) => n + (i.stage === "ready" ? i.file.size : i.file.size * i.progress),
    0,
  );
  return {
    items,
    add,
    cancel,
    retry,
    remove,
    clearFinished,
    busy: items.some((i) => i.stage === "queued" || LIVE.includes(i.stage)),
    overall: totalBytes ? doneBytes / totalBytes : 0,
  };
}
