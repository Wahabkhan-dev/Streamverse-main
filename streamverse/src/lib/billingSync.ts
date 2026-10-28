import { meApi } from "@/api/me.api";
import type { ApiSyncedSubscription } from "@/api/types";
import type { SubscriptionStatus } from "./user";
import { updateUser } from "./user";

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** The server's status values (uppercase, from Stripe) in the words the screens use. */
const LOCAL_STATUS: Record<string, SubscriptionStatus> = { ACTIVE: "active", TRIALING: "active", PAST_DUE: "past_due", CANCELED: "canceled" };

/** Mirrors the server's subscription into the browser store the signup/profile screens read; true when it grants access. */
function mirror(view: ApiSyncedSubscription): boolean {
  const status = (view.status && LOCAL_STATUS[view.status]) || "canceled";
  // never subscribed: no plan name at all (so the header shows no plan or "canceled" badge)
  const plan = view.status ? view.plan : null;
  updateUser((s) => ({
    ...s,
    subscription: {
      ...s.subscription,
      status,
      ...(plan
        ? {
            plan: plan.name,
            price: plan.price / 100,
            interval: plan.billingInterval === "YEARLY" ? ("Yearly" as const) : ("Monthly" as const),
            startedOn: day(view.currentPeriodStart),
            renewsOn: day(view.currentPeriodEnd),
          }
        : { plan: "" }),
    },
  }));
  return status === "active";
}

/** Reads this customer's subscription (so nobody keeps the demo "Premium" that ships in the browser store). */
export async function mirrorSubscription(): Promise<boolean> {
  return mirror((await meApi.getSubscription()).data as unknown as ApiSyncedSubscription);
}

/** Asks Stripe (through the server) for the latest state right after a payment: works without a webhook. */
export async function syncSubscription(): Promise<boolean> {
  return mirror((await meApi.syncSubscription()).data);
}
