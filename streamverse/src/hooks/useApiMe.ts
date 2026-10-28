import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meApi } from "@/api/me.api";
import { DEMO_MODE } from "@/lib/config";
import { useIsAuthenticated } from "@/lib/authState";
import { refreshAuthUser } from "@/lib/authSession";

/** A signed-in customer's own data is requested only once the server has confirmed the session (never for guests or while checking). */
const useLiveSession = () => {
  const authed = useIsAuthenticated();
  return !DEMO_MODE && authed;
};

const MY_LIST_KEY = ["me", "my-list"] as const;
const LIBRARY_KEY = ["me", "library"] as const;
const HISTORY_KEY = ["me", "history"] as const;
const NOTIFICATIONS_KEY = ["me", "notifications"] as const;
const PROFILE_KEY = ["me", "profile"] as const;

export function useApiProfileQuery() {
  const live = useLiveSession();
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async () => {
      const res = await meApi.getProfile();
      return res.data;
    },
    enabled: live,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof meApi.updateProfile>[0]) => meApi.updateProfile(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROFILE_KEY });
      void refreshAuthUser();
    },
  });
}

export function useApiMyListQuery() {
  const live = useLiveSession();
  return useQuery({
    queryKey: MY_LIST_KEY,
    queryFn: async () => {
      const res = await meApi.getMyList();
      return res.data;
    },
    enabled: live,
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
  const live = useLiveSession();
  return useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: async () => {
      const res = await meApi.getLibrary();
      return res.data;
    },
    enabled: live,
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

export function useRemoveFromLibraryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => meApi.removeFromLibrary(contentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: LIBRARY_KEY }),
  });
}

export function useApiHistoryQuery(page = 1) {
  const live = useLiveSession();
  return useQuery({
    queryKey: [...HISTORY_KEY, page] as const,
    queryFn: async () => {
      const res = await meApi.getHistory(page);
      return res;
    },
    enabled: live,
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
  const live = useLiveSession();
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async () => {
      const res = await meApi.getNotifications();
      return res.data;
    },
    enabled: live,
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
