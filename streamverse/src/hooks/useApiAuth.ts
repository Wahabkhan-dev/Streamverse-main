import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/api/auth.api";
import { setAccessToken, clearAccessToken } from "@/api/client";
import { setAuthUser, clearAuthUser } from "@/lib/authState";
import { DEMO_MODE } from "@/lib/config";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

/** Fetch and cache the current user — only when not in demo mode. */
export function useCurrentUserQuery() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const res = await authApi.me();
      setAuthUser(res.data);
      return res.data;
    },
    enabled: !DEMO_MODE,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (res) => {
      setAccessToken(res.data.accessToken);
      setAuthUser(res.data.user);
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

export function useRegisterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, email, password }: { name: string; email: string; password: string }) =>
      authApi.register(name, email, password),
    onSuccess: (res) => {
      setAccessToken(res.data.accessToken);
      setAuthUser(res.data.user);
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      clearAccessToken();
      clearAuthUser();
      queryClient.clear();
    },
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
  });
}

export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
  });
}
