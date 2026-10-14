import type { SubscriptionStatus } from "@prisma/client";
import * as subscriptionRepository from "../../repositories/subscription.repository";
import { env } from "../../config/env";

/**
 * Phase 7 (Section 15): the ONE place that decides which subscription statuses grant protected access —
 * nothing else (contentAccess.service.ts included) re-implements this list.
 *
 * Phase 8 addition: PAST_DUE may grant access during a configurable grace window
 * (`SUBSCRIPTION_PAST_DUE_GRACE_DAYS`). Default is 0 (deny immediately).
 */
const UNCONDITIONAL_ACCESS_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(["TRIALING", "ACTIVE"]);

export function statusGrantsAccess(status: SubscriptionStatus): boolean {
  return UNCONDITIONAL_ACCESS_STATUSES.has(status);
}

/**
 * Phase 8: PAST_DUE grace window check. Returns true if:
 * - graceDays > 0, AND
 * - the subscription's currentPeriodEnd is within the grace window from now
 */
export function pastDueGrantsAccess(currentPeriodEnd: Date | null | undefined, graceDays: number): boolean {
  if (graceDays <= 0 || !currentPeriodEnd) return false;
  const graceDeadline = new Date(currentPeriodEnd.getTime() + graceDays * 24 * 60 * 60 * 1000);
  return graceDeadline > new Date();
}

/** Section 59: queries real Stripe-backed subscription state to determine whether a user has active access. */
export async function hasActiveAccess(userId: string): Promise<boolean> {
  const subscription = await subscriptionRepository.findByUserId(userId);
  if (!subscription) return false;
  if (statusGrantsAccess(subscription.status)) return true;

  // Phase 8: PAST_DUE grace period
  if (subscription.status === "PAST_DUE") {
    const graceDays = env.SUBSCRIPTION_PAST_DUE_GRACE_DAYS;
    if (pastDueGrantsAccess(subscription.currentPeriodEnd, graceDays)) return true;
  }

  return false;
}

/** Returns whether a subscription grants access, plus detail about the subscription state. */
export async function checkSubscriptionAccess(userId: string): Promise<{
  hasAccess: boolean;
  hasSubscription: boolean;
  status: SubscriptionStatus | null;
}> {
  const subscription = await subscriptionRepository.findByUserId(userId);
  if (!subscription) return { hasAccess: false, hasSubscription: false, status: null };

  let hasAccess = statusGrantsAccess(subscription.status);
  if (!hasAccess && subscription.status === "PAST_DUE") {
    hasAccess = pastDueGrantsAccess(subscription.currentPeriodEnd, env.SUBSCRIPTION_PAST_DUE_GRACE_DAYS);
  }

  return { hasAccess, hasSubscription: true, status: subscription.status };
}
