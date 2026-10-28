import type { ReactNode } from "react";
import { gateFor, type Gate } from "@/lib/access";
import { itemTitle, type Item } from "@/lib/items";
import { useSettings } from "@/lib/store";
import { confirmAge, useUser, type SubscriptionStatus } from "@/lib/user";
import { DEMO_MODE } from "@/lib/config";
import { useApiSubscriptionQuery } from "@/hooks/useApiSubscription";
import { AgeRestricted, ContentUnavailable, ExpiredContent, NotYetAvailable, RegionUnavailable, SubscribersOnly } from "./states";

export function useGate(item: Item | undefined): Gate {
  const profile = useUser((s) => s.profile);
  const subscription = useUser((s) => s.subscription);
  const apiSubQuery = useApiSubscriptionQuery();
  const ageConfirmed = useUser((s) => s.ageConfirmed);
  const settings = useSettings();
  if (!item) return { kind: "removed" };

  // When not in demo mode, override subscription status with real API data
  let effectiveSub = subscription;
  if (!DEMO_MODE && apiSubQuery.data) {
    const apiStatus = apiSubQuery.data.status;
    // Map "trialing" to "active" for gate purposes
    const mapped: SubscriptionStatus = apiStatus === "trialing" ? "active" : (apiStatus as SubscriptionStatus);
    effectiveSub = { ...subscription, status: mapped };
  }

  return gateFor(item, { profile, subscription: effectiveSub, ageConfirmed }, settings);
}

export function GateScreen({ gate, item }: { gate: Gate; item: Item }) {
  switch (gate.kind) {
    case "age":
      return <AgeRestricted minAge={gate.minAge} title={itemTitle(item)} onConfirm={() => confirmAge(item)} />;
    case "subscribers":
      return <SubscribersOnly />;
    case "region":
      return <RegionUnavailable country={gate.country} />;
    case "not-yet":
      return <NotYetAvailable {...(gate.when ? { when: gate.when } : {})} />;
    case "expired":
      return <ExpiredContent />;
    case "removed":
      return <ContentUnavailable />;
    default:
      return null;
  }
}

/** An admin's Preview of a title customers can't see yet (the API only sends `previewStatus` to admins). */
export function PreviewBanner({ status }: { status: string | undefined }) {
  if (!status) return null;
  return (
    <div role="status" data-testid="preview-banner" className="relative z-10 bg-info/15 px-4 py-2 text-center text-sm font-semibold text-info">
      Preview: customers can't see this title yet. It is {status.toLowerCase()}.
    </div>
  );
}

/** Renders children only when the title is open to this customer; otherwise the matching restriction screen. */
export function Gated({ item, children }: { item: Item | undefined; children: ReactNode }) {
  const gate = useGate(item);
  if (!item) return <ContentUnavailable message="We couldn't find that title." />;
  if (gate.kind !== "ok") return <GateScreen gate={gate} item={item} />;
  return <>{children}</>;
}
