import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meApi } from "@/api/me.api";
import { DEMO_MODE } from "@/lib/config";
import { useIsAuthenticated } from "@/lib/authState";

export const SUBSCRIPTION_QUERY_KEY = ["me", "subscription"] as const;
export const INVOICES_QUERY_KEY = ["me", "payments"] as const;
export const PAYMENT_METHODS_QUERY_KEY = ["me", "payment-methods"] as const;

export function useApiSubscriptionQuery() {
  const authed = useIsAuthenticated();
  return useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: async () => {
      const res = await meApi.getSubscription();
      return res.data;
    },
    enabled: !DEMO_MODE && authed,
    staleTime: 60 * 1000,
  });
}

export function useApiInvoicesQuery() {
  return useQuery({
    queryKey: INVOICES_QUERY_KEY,
    queryFn: async () => {
      const res = await meApi.getInvoices();
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 5 * 60 * 1000,
  });
}

export function useApiPaymentMethodsQuery() {
  return useQuery({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    queryFn: async () => {
      const res = await meApi.getPaymentMethods();
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCheckoutMutation() {
  return useMutation({
    mutationFn: (planId: string) => meApi.checkout(planId),
    onSuccess: (res) => {
      // Redirect to Stripe checkout
      if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
    },
  });
}

export function useCancelSubscriptionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => meApi.cancelSubscription(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY }),
  });
}

export function useResumeSubscriptionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => meApi.resumeSubscription(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY }),
  });
}

export function useChangePlanMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => meApi.changePlan(planId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY }),
  });
}

export function useBillingPortalMutation() {
  return useMutation({
    mutationFn: () => meApi.billingPortal(),
    onSuccess: (res) => {
      if (res.data.url) window.location.href = res.data.url;
    },
  });
}

export function useSetupIntentMutation() {
  return useMutation({
    mutationFn: () => meApi.createSetupIntent(),
  });
}

export function useSetDefaultPaymentMethodMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethodId: string) => meApi.setDefaultPaymentMethod(paymentMethodId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY }),
  });
}

export function useDeletePaymentMethodMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethodId: string) => meApi.deletePaymentMethod(paymentMethodId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY }),
  });
}
