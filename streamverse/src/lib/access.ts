import { itemEntity, todayIso, type Item } from "./items";
import type { Settings } from "./store";
import { refKey, type UserState } from "./user";

/**
 * What a customer sees when they open a title. The frontend decides from the title's restrictions and
 * the demo customer's profile. These rules are display-only; a server will have to enforce them later.
 */
export type Gate =
  | { kind: "ok" }
  | { kind: "removed" }
  | { kind: "not-yet"; when?: string }
  | { kind: "expired"; when?: string }
  | { kind: "region"; country: string }
  | { kind: "subscribers" }
  | { kind: "age"; minAge: number };

export function gateFor(item: Item, user: Pick<UserState, "profile" | "subscription" | "ageConfirmed">, settings: Pick<Settings, "ageGate">): Gate {
  const e = itemEntity(item);
  const r = e.restrictions;
  const today = todayIso();
  if (e.status === "Draft" || e.status === "Unpublished" || e.status === "Archived" || r?.access === "Hidden") return { kind: "removed" };
  if (e.status === "Scheduled") return e.publishAt ? { kind: "not-yet", when: e.publishAt } : { kind: "not-yet" };
  if (r?.availableFrom && r.availableFrom > today) return { kind: "not-yet", when: r.availableFrom };
  if (r?.availableUntil && r.availableUntil < today) return { kind: "expired", when: r.availableUntil };
  if (r?.territory && r.territory !== "worldwide" && r.countries?.length) {
    const inList = r.countries.includes(user.profile.country);
    if ((r.territory === "selected" && !inList) || (r.territory === "exclude" && inList)) return { kind: "region", country: user.profile.country };
  }
  if (r?.access === "Subscribers Only" && user.subscription.status !== "active") return { kind: "subscribers" };
  const min = r?.minAge ?? 0;
  if (settings.ageGate && (r?.ageRestricted || min > 0) && !user.ageConfirmed.includes(refKey(item))) return { kind: "age", minAge: min || 18 };
  return { kind: "ok" };
}
