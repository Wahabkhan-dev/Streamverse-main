import { useMemo } from "react";
import { DEMO_MODE } from "@/lib/config";
import { useAdminPaymentsQuery, useAdminSubscriptionsQuery } from "./useAdminApi";

export interface AdminAlert {
  id: string;
  kind: "Payments";
  title: string;
  detail: string;
  /** ISO time of the event */
  at: string;
}

type Row = {
  id: string;
  amount?: number;
  currency?: string;
  createdAt?: string;
  updatedAt?: string;
  currentPeriodEnd?: string | null;
  user?: { fullName?: string; email?: string };
  plan?: { name?: string };
  subscription?: { plan?: { name?: string } } | null;
};

const who = (r: Row) => r.user?.fullName || r.user?.email || "A customer";
const usd = (cents: number | undefined, currency = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format((cents ?? 0) / 100);

/**
 * What needs the admin's attention right now, worked out from real billing data: renewals that failed (past-due subscriptions)
 * and recent failed payments. Nothing is invented; with no problems the list is empty.
 */
export function useAdminAlerts() {
  const pastDue = useAdminSubscriptionsQuery({ status: "PAST_DUE", limit: 20 });
  const failed = useAdminPaymentsQuery({ status: "FAILED", limit: 20 });
  return useMemo(() => {
    if (DEMO_MODE) return { items: [] as AdminAlert[], loading: false, error: false };
    const subs = ((pastDue.data as { data?: unknown[] } | undefined)?.data ?? []) as Row[];
    const pays = ((failed.data as { data?: unknown[] } | undefined)?.data ?? []) as Row[];
    const items: AdminAlert[] = [
      ...subs.map((r) => ({ id: `sub-${r.id}`, kind: "Payments" as const, title: `Renewal failed for ${who(r)}`, detail: `${r.plan?.name ?? "Their plan"} is past due. They need to update their card or retry the payment.`, at: r.updatedAt ?? r.currentPeriodEnd ?? new Date(0).toISOString() })),
      ...pays.map((r) => ({ id: `pay-${r.id}`, kind: "Payments" as const, title: `Payment of ${usd(r.amount, r.currency)} failed for ${who(r)}`, detail: r.subscription?.plan?.name ? `${r.subscription.plan.name} plan.` : "The charge was declined.", at: r.createdAt ?? new Date(0).toISOString() })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return { items, loading: pastDue.isLoading || failed.isLoading, error: pastDue.isError || failed.isError };
  }, [pastDue.data, failed.data, pastDue.isLoading, failed.isLoading, pastDue.isError, failed.isError]);
}
