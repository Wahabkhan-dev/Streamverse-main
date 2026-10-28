import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  mediaLibraryApi,
  type MediaListParams,
  type MediaMetadataPatch,
} from "@/api/mediaLibrary.api";
import { DEMO_MODE } from "@/lib/config";

const E = !DEMO_MODE;

/** While a file is being processed its bar moves, so the screen asks again every few seconds; otherwise it does not. */
const PROGRESS_POLL_MS = 4000;
const moving = (items: Array<{ progress?: unknown }> | undefined) =>
  items?.some((it) => it.progress) ? PROGRESS_POLL_MS : false;

export const useMediaListQuery = (p: MediaListParams, opts: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: ["admin", "media", "list", p],
    queryFn: () => mediaLibraryApi.list(p),
    enabled: E && (opts.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: (q) => moving(q.state.data?.data),
  });

export const useMediaStatsQuery = () =>
  useQuery({
    queryKey: ["admin", "media", "stats"],
    queryFn: () => mediaLibraryApi.stats(),
    enabled: E,
    staleTime: 15_000,
  });

export const useMediaDetailQuery = (id: string | undefined) =>
  useQuery({
    queryKey: ["admin", "media", "detail", id],
    queryFn: () => mediaLibraryApi.detail(id!),
    enabled: E && !!id,
    refetchInterval: (q) => moving(q.state.data ? [q.state.data.data] : undefined),
  });

/**
 * Anything that changes a file can change what Movies / eBooks / Audiobooks / Homepage / Banners show, so refresh them all.
 * `goneId` is a file that no longer exists (deleted or replaced): its own detail query is left alone so an open drawer
 * does not re-request a 404 while it closes.
 */
export function useInvalidateMedia() {
  const qc = useQueryClient();
  return (goneId?: string) => {
    void qc.invalidateQueries({
      queryKey: ["admin", "media"],
      predicate: (q) => !(goneId && q.queryKey[2] === "detail" && q.queryKey[3] === goneId),
    });
    if (goneId) qc.removeQueries({ queryKey: ["admin", "media", "detail", goneId], exact: true });
    for (const k of [
      "movies",
      "ebooks",
      "audiobooks",
      "banners",
      "collections",
      "homepage",
      "dashboard",
    ])
      void qc.invalidateQueries({ queryKey: ["admin", k] });
    void qc.invalidateQueries({ queryKey: ["catalog"] });
  };
}

export function useMediaMutations() {
  const invalidate = useInvalidateMedia();
  return {
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: MediaMetadataPatch }) =>
        mediaLibraryApi.update(id, patch),
      onSuccess: () => invalidate(),
    }),
    remove: useMutation({
      mutationFn: (id: string) => mediaLibraryApi.remove(id),
      onSuccess: (_d, id) => invalidate(id),
    }),
    bulkDelete: useMutation({
      mutationFn: (ids: string[]) => mediaLibraryApi.bulkDelete(ids),
      onSuccess: () => invalidate(),
    }),
    replace: useMutation({
      mutationFn: ({ id, newAssetId }: { id: string; newAssetId: string }) =>
        mediaLibraryApi.replace(id, newAssetId),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    retryProcessing: useMutation({
      mutationFn: (id: string) => mediaLibraryApi.retryProcessing(id),
      onSuccess: (_d, id) => invalidate(id),
    }),
    reconcile: useMutation({
      mutationFn: () =>
        mediaLibraryApi.reconcile({ batch: 200, scanBucket: true, scanLimit: 2000 }),
    }),
  };
}
