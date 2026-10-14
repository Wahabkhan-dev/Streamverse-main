/**
 * TanStack Query hooks for all admin API endpoints.
 * Each hook is disabled when DEMO_MODE=true so local admin state is used instead.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminMoviesApi,
  adminEbooksApi,
  adminAudiobooksApi,
  adminGenresApi,
  adminTagsApi,
  adminLanguagesApi,
  adminCollectionsApi,
  adminHomepageApi,
  adminBannersApi,
  adminLegalApi,
  adminSettingsApi,
  adminPlansApi,
  adminUsersApi,
  adminSubscriptionsApi,
  adminPaymentsApi,
  adminAnalyticsApi,
  adminMediaApi,
  type AdminListParams,
} from "@/api/admin.api";
import { DEMO_MODE } from "@/lib/config";

const E = !DEMO_MODE; // shorthand: only enable when not in demo mode

/* ─────────── Movies ─────────── */
export const useAdminMoviesQuery = (p?: AdminListParams) =>
  useQuery({ queryKey: ["admin", "movies", p], queryFn: () => adminMoviesApi.list(p), enabled: E });

export const useAdminMovieMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "movies"] });
  return {
    create: useMutation({ mutationFn: adminMoviesApi.create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminMoviesApi.update>[1] }) => adminMoviesApi.update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: adminMoviesApi.delete, onSuccess: inv }),
    publish: useMutation({ mutationFn: adminMoviesApi.publish, onSuccess: inv }),
    unpublish: useMutation({ mutationFn: adminMoviesApi.unpublish, onSuccess: inv }),
  };
};

/* ─────────── eBooks ─────────── */
export const useAdminEbooksQuery = (p?: AdminListParams) =>
  useQuery({ queryKey: ["admin", "ebooks", p], queryFn: () => adminEbooksApi.list(p), enabled: E });

export const useAdminEbookMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "ebooks"] });
  return {
    create: useMutation({ mutationFn: adminEbooksApi.create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminEbooksApi.update>[1] }) => adminEbooksApi.update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: adminEbooksApi.delete, onSuccess: inv }),
    publish: useMutation({ mutationFn: adminEbooksApi.publish, onSuccess: inv }),
    unpublish: useMutation({ mutationFn: adminEbooksApi.unpublish, onSuccess: inv }),
  };
};

/* ─────────── Audiobooks ─────────── */
export const useAdminAudiobooksQuery = (p?: AdminListParams) =>
  useQuery({ queryKey: ["admin", "audiobooks", p], queryFn: () => adminAudiobooksApi.list(p), enabled: E });

export const useAdminAudiobookMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "audiobooks"] });
  return {
    create: useMutation({ mutationFn: adminAudiobooksApi.create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminAudiobooksApi.update>[1] }) => adminAudiobooksApi.update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: adminAudiobooksApi.delete, onSuccess: inv }),
    publish: useMutation({ mutationFn: adminAudiobooksApi.publish, onSuccess: inv }),
    unpublish: useMutation({ mutationFn: adminAudiobooksApi.unpublish, onSuccess: inv }),
  };
};

/* ─────────── Genres / Tags / Languages ─────────── */
export const useAdminGenresQuery = () =>
  useQuery({ queryKey: ["admin", "genres"], queryFn: adminGenresApi.list, enabled: E });

export const useAdminTagsQuery = () =>
  useQuery({ queryKey: ["admin", "tags"], queryFn: adminTagsApi.list, enabled: E });

export const useAdminLanguagesQuery = () =>
  useQuery({ queryKey: ["admin", "languages"], queryFn: adminLanguagesApi.list, enabled: E });

/* ─────────── Collections ─────────── */
export const useAdminCollectionsQuery = (p?: AdminListParams) =>
  useQuery({ queryKey: ["admin", "collections", p], queryFn: () => adminCollectionsApi.list(p), enabled: E });

export const useAdminCollectionMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "collections"] });
  return {
    create: useMutation({ mutationFn: adminCollectionsApi.create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminCollectionsApi.update>[1] }) => adminCollectionsApi.update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: adminCollectionsApi.delete, onSuccess: inv }),
  };
};

/* ─────────── Homepage ─────────── */
export const useAdminHomepageQuery = () =>
  useQuery({ queryKey: ["admin", "homepage"], queryFn: adminHomepageApi.list, enabled: E });

/* ─────────── Banners ─────────── */
export const useAdminBannersQuery = () =>
  useQuery({ queryKey: ["admin", "banners"], queryFn: adminBannersApi.list, enabled: E });

export const useAdminBannerMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "banners"] });
  return {
    create: useMutation({ mutationFn: adminBannersApi.create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminBannersApi.update>[1] }) => adminBannersApi.update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: adminBannersApi.delete, onSuccess: inv }),
  };
};

/* ─────────── Legal ─────────── */
export const useAdminLegalQuery = () =>
  useQuery({ queryKey: ["admin", "legal"], queryFn: adminLegalApi.list, enabled: E });

/* ─────────── Settings ─────────── */
export const useAdminSettingsQuery = () =>
  useQuery({ queryKey: ["admin", "settings"], queryFn: adminSettingsApi.get, enabled: E });

export const useAdminSettingsMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminSettingsApi.update,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "settings"] }),
  });
};

/* ─────────── Plans ─────────── */
export const useAdminPlansQuery = () =>
  useQuery({ queryKey: ["admin", "plans"], queryFn: adminPlansApi.list, enabled: E });

export const useAdminPlanMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "plans"] });
  return {
    create: useMutation({ mutationFn: adminPlansApi.create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminPlansApi.update>[1] }) => adminPlansApi.update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: adminPlansApi.delete, onSuccess: inv }),
    activate: useMutation({ mutationFn: adminPlansApi.activate, onSuccess: inv }),
    deactivate: useMutation({ mutationFn: adminPlansApi.deactivate, onSuccess: inv }),
  };
};

/* ─────────── Users ─────────── */
export const useAdminUsersQuery = (p?: AdminListParams) =>
  useQuery({ queryKey: ["admin", "users", p], queryFn: () => adminUsersApi.list(p), enabled: E });

export const useAdminUserMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "users"] });
  return {
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminUsersApi.update>[1] }) => adminUsersApi.update(id, data), onSuccess: inv }),
    suspend: useMutation({ mutationFn: adminUsersApi.suspend, onSuccess: inv }),
    unsuspend: useMutation({ mutationFn: adminUsersApi.unsuspend, onSuccess: inv }),
    remove: useMutation({ mutationFn: adminUsersApi.delete, onSuccess: inv }),
  };
};

/* ─────────── Subscriptions ─────────── */
export const useAdminSubscriptionsQuery = (p?: AdminListParams) =>
  useQuery({ queryKey: ["admin", "subscriptions", p], queryFn: () => adminSubscriptionsApi.list(p), enabled: E });

/* ─────────── Payments ─────────── */
export const useAdminPaymentsQuery = (p?: AdminListParams) =>
  useQuery({ queryKey: ["admin", "payments", p], queryFn: () => adminPaymentsApi.list(p), enabled: E });

export const useAdminRefundMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminPaymentsApi.refund,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "payments"] }),
  });
};

/* ─────────── Analytics ─────────── */
export const useAdminDashboardQuery = () =>
  useQuery({ queryKey: ["admin", "dashboard"], queryFn: adminAnalyticsApi.getDashboard, enabled: E, staleTime: 5 * 60 * 1000 });

export const useAdminRevenueQuery = (params?: Parameters<typeof adminAnalyticsApi.getRevenue>[0]) =>
  useQuery({ queryKey: ["admin", "analytics", params], queryFn: () => adminAnalyticsApi.getRevenue(params), enabled: E, staleTime: 5 * 60 * 1000 });

export const useAdminAuditLogsQuery = (p?: AdminListParams) =>
  useQuery({ queryKey: ["admin", "audit-logs", p], queryFn: () => adminAnalyticsApi.getAuditLogs(p), enabled: E });

/* ─────────── Media uploads ─────────── */
export const useAdminRequestUploadMutation = () =>
  useMutation({ mutationFn: adminMediaApi.requestUpload });

export const useAdminConfirmUploadMutation = () =>
  useMutation({ mutationFn: ({ key, contentId }: { key: string; contentId?: string }) => adminMediaApi.confirmUpload(key, contentId) });
