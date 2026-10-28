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
  type AdminListParams,
} from "@/api/admin.api";
import { DEMO_MODE } from "@/lib/config";

const E = !DEMO_MODE; // shorthand: only enable when not in demo mode

/* ─────────── Movies ─────────── */
// with no params the whole list is loaded (every page), so the admin list never stops at the server's first page
export const useAdminMoviesQuery = (p?: AdminListParams, opts?: { enabled?: boolean }) =>
  useQuery({ queryKey: ["admin", "movies", p], queryFn: () => (p ? adminMoviesApi.list(p) : adminMoviesApi.listAll()), enabled: E && (opts?.enabled ?? true) });

export const useAdminMovieMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "movies"] });
  return {
    create: useMutation({ mutationFn: adminMoviesApi.create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminMoviesApi.update>[1] }) => adminMoviesApi.update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: adminMoviesApi.delete, onSuccess: inv }),
    publish: useMutation({ mutationFn: adminMoviesApi.publish, onSuccess: inv }),
    unpublish: useMutation({ mutationFn: adminMoviesApi.unpublish, onSuccess: inv }),
    archive: useMutation({ mutationFn: adminMoviesApi.archive, onSuccess: inv }),
  };
};

/* ─────────── eBooks ─────────── */
export const useAdminEbooksQuery = (p?: AdminListParams, opts?: { enabled?: boolean }) =>
  useQuery({ queryKey: ["admin", "ebooks", p], queryFn: () => (p ? adminEbooksApi.list(p) : adminEbooksApi.listAll()), enabled: E && (opts?.enabled ?? true) });

export const useAdminEbookMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "ebooks"] });
  return {
    create: useMutation({ mutationFn: adminEbooksApi.create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminEbooksApi.update>[1] }) => adminEbooksApi.update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: adminEbooksApi.delete, onSuccess: inv }),
    publish: useMutation({ mutationFn: adminEbooksApi.publish, onSuccess: inv }),
    unpublish: useMutation({ mutationFn: adminEbooksApi.unpublish, onSuccess: inv }),
    archive: useMutation({ mutationFn: adminEbooksApi.archive, onSuccess: inv }),
  };
};

/* ─────────── Audiobooks ─────────── */
export const useAdminAudiobooksQuery = (p?: AdminListParams, opts?: { enabled?: boolean }) =>
  useQuery({ queryKey: ["admin", "audiobooks", p], queryFn: () => (p ? adminAudiobooksApi.list(p) : adminAudiobooksApi.listAll()), enabled: E && (opts?.enabled ?? true) });

export const useAdminAudiobookMutation = () => {
  const qc = useQueryClient();
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "audiobooks"] });
  return {
    create: useMutation({ mutationFn: adminAudiobooksApi.create, onSuccess: inv }),
    update: useMutation({ mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminAudiobooksApi.update>[1] }) => adminAudiobooksApi.update(id, data), onSuccess: inv }),
    remove: useMutation({ mutationFn: adminAudiobooksApi.delete, onSuccess: inv }),
    publish: useMutation({ mutationFn: adminAudiobooksApi.publish, onSuccess: inv }),
    unpublish: useMutation({ mutationFn: adminAudiobooksApi.unpublish, onSuccess: inv }),
    archive: useMutation({ mutationFn: adminAudiobooksApi.archive, onSuccess: inv }),
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

export const useAdminHomepageMutation = () => {
  const qc = useQueryClient();
  const inv = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "homepage"] });
    void qc.invalidateQueries({ queryKey: ["homepage"] });
  };
  return {
    create: useMutation({ mutationFn: adminHomepageApi.create, onSuccess: inv }),
    update: useMutation({
      mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminHomepageApi.updateSection>[1] }) =>
        adminHomepageApi.updateSection(id, data),
      onSuccess: inv,
    }),
    reorder: useMutation({ mutationFn: adminHomepageApi.reorder, onSuccess: inv }),
    remove: useMutation({ mutationFn: adminHomepageApi.remove, onSuccess: inv }),
  };
};

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

export const useAdminSummaryQuery = () =>
  useQuery({ queryKey: ["admin", "dashboard", "summary"], queryFn: adminAnalyticsApi.getSummary, enabled: E, staleTime: 30 * 1000 });

export const useAdminPlatformStatusQuery = () =>
  useQuery({ queryKey: ["admin", "dashboard", "platform-status"], queryFn: adminAnalyticsApi.getPlatformStatus, enabled: E, staleTime: 30 * 1000 });

export const useAdminUserGrowthQuery = (params: Parameters<typeof adminAnalyticsApi.getUserGrowth>[0]) =>
  useQuery({ queryKey: ["admin", "analytics", "users", params], queryFn: () => adminAnalyticsApi.getUserGrowth(params), enabled: E, staleTime: 5 * 60 * 1000 });

/** One analytics report (subscriptions, movies, top-content, ...) for the filters chosen on the Analytics page. */
export const useAdminReportQuery = <T,>(kind: string, params: Record<string, string>) =>
  useQuery({ queryKey: ["admin", "analytics", kind, params], queryFn: async () => (await adminAnalyticsApi.report<T>(kind, params)).data, enabled: E, staleTime: 60 * 1000 });

export const useAdminAuditLogsQuery = (p?: AdminListParams) =>
  useQuery({ queryKey: ["admin", "audit-logs", p], queryFn: () => adminAnalyticsApi.getAuditLogs(p), enabled: E });
