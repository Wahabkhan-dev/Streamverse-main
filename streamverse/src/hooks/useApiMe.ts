import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meApi } from "@/api/me.api";
import { DEMO_MODE } from "@/lib/config";
import { AUTH_QUERY_KEY } from "./useApiAuth";

const MY_LIST_KEY = ["me", "my-list"] as const;
const LIBRARY_KEY = ["me", "library"] as const;
const HISTORY_KEY = ["me", "history"] as const;
const NOTIFICATIONS_KEY = ["me", "notifications"] as const;
const PROFILE_KEY = ["me", "profile"] as const;

export function useApiProfileQuery() {
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async () => {
      const res = await meApi.getProfile();
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof meApi.updateProfile>[0]) => meApi.updateProfile(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROFILE_KEY });
      void qc.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

export function useApiMyListQuery() {
  return useQuery({
    queryKey: MY_LIST_KEY,
    queryFn: async () => {
      const res = await meApi.getMyList();
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAddToMyListMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contentId, contentType }: { contentId: string; contentType: "movie" | "ebook" | "audiobook" }) =>
      meApi.addToMyList(contentId, contentType),
    onSuccess: () => void qc.invalidateQueries({ queryKey: MY_LIST_KEY }),
  });
}

export function useRemoveFromMyListMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => meApi.removeFromMyList(contentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: MY_LIST_KEY }),
  });
}

export function useApiLibraryQuery() {
  return useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: async () => {
      const res = await meApi.getLibrary();
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAddToLibraryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contentId, contentType }: { contentId: string; contentType: "movie" | "ebook" | "audiobook" }) =>
      meApi.addToLibrary(contentId, contentType),
    onSuccess: () => void qc.invalidateQueries({ queryKey: LIBRARY_KEY }),
  });
}

export function useApiHistoryQuery(page = 1) {
  return useQuery({
    queryKey: [...HISTORY_KEY, page] as const,
    queryFn: async () => {
      const res = await meApi.getHistory(page);
      return res;
    },
    enabled: !DEMO_MODE,
    staleTime: 2 * 60 * 1000,
  });
}

export function useDeleteHistoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => meApi.deleteHistoryItem(contentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: HISTORY_KEY }),
  });
}

export function useClearHistoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => meApi.clearHistory(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: HISTORY_KEY }),
  });
}

export function useApiNotificationsQuery() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async () => {
      const res = await meApi.getNotifications();
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 60 * 1000,
  });
}

export function useMarkNotificationReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => meApi.markNotificationRead(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useMarkAllNotificationsReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => meApi.markAllNotificationsRead(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useSaveProgressMutation() {
  return useMutation({
    mutationFn: ({
      type,
      contentId,
      data,
    }: {
      type: "movie" | "ebook" | "audiobook";
      contentId: string;
      data: Parameters<typeof meApi.saveProgress>[2];
    }) => meApi.saveProgress(type, contentId, data),
  });
}
