/**
 * What a plan offers, in plain words, and what changes for the people already on it when an admin edits it.
 * Used by Admin -> Subscriptions so nobody has to guess what "maxDevices: 1" does to a customer.
 */

export type QualityLabel = "480p" | "720p" | "1080p" | "4K";

export interface PlanOffer {
  moviesEnabled: boolean;
  ebooksEnabled: boolean;
  audiobooksEnabled: boolean;
  /** null = best quality available */
  maxVideoQuality: QualityLabel | null;
  /** null = any number of devices */
  maxDevices: number | null;
  /** null = unlimited (movies and audiobooks count; eBooks never do) */
  maxConcurrentStreams: number | null;
}

export interface PlanTerms extends PlanOffer {
  /** minor units (cents) */
  priceAmount: number;
  billingInterval: "MONTHLY" | "YEARLY";
  active: boolean;
}

export const QUALITY_OPTIONS: { value: QualityLabel | null; label: string }[] = [
  { value: null, label: "No limit (best quality available)" },
  { value: "480p", label: "480p (standard definition)" },
  { value: "720p", label: "720p (HD)" },
  { value: "1080p", label: "1080p (Full HD)" },
  { value: "4K", label: "4K (Ultra HD)" },
];

const QUALITY_RANK: Record<QualityLabel, number> = { "480p": 1, "720p": 2, "1080p": 3, "4K": 4 };
/** null (no limit) ranks above everything */
const rank = (q: QualityLabel | null) => (q === null ? 99 : QUALITY_RANK[q]);

const qualityName = (q: QualityLabel | null) => (q === null ? "the best quality available" : `${q}${q === "480p" ? " (SD)" : q === "720p" ? " (HD)" : q === "1080p" ? " (Full HD)" : " (Ultra HD)"}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

const contentOf = (o: PlanOffer) => [o.moviesEnabled && "movies", o.ebooksEnabled && "eBooks", o.audiobooksEnabled && "audiobooks"].filter(Boolean) as string[];

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const perInterval = (i: "MONTHLY" | "YEARLY") => (i === "YEARLY" ? "year" : "month");

/** The bullet points a customer on this plan will actually get. `ok: false` marks something that looks like a mistake. */
export function describeOffer(o: PlanOffer): { text: string; ok: boolean }[] {
  const content = contentOf(o);
  return [
    content.length === 0 ? { text: "Unlocks no content at all. Customers would pay for nothing, so turn at least one on.", ok: false } : { text: `Unlocks ${list(content)}.`, ok: true },
    { text: o.moviesEnabled ? `Video plays in ${qualityName(o.maxVideoQuality)}.` : "No video (movies are off).", ok: true },
    { text: o.maxDevices === null ? "Any number of devices can be signed in." : `Up to ${plural(o.maxDevices, "device", "devices")} signed in at once.`, ok: true },
    { text: o.maxConcurrentStreams === null ? "Any number of movies or audiobooks can play at the same time." : `${plural(o.maxConcurrentStreams, "movie or audiobook", "movies or audiobooks")} can play at the same time (eBooks don't count).`, ok: true },
  ];
}

/** What editing a plan does to the customers already on it. Empty when nothing they feel has changed. */
export function describeChanges(before: PlanTerms, after: PlanTerms): { text: string; affectsAccess: boolean }[] {
  const out: { text: string; affectsAccess: boolean }[] = [];
  const kinds: [keyof PlanOffer, string][] = [
    ["moviesEnabled", "movies"],
    ["ebooksEnabled", "eBooks"],
    ["audiobooksEnabled", "audiobooks"],
  ];
  for (const [key, name] of kinds) {
    if (before[key] === after[key]) continue;
    out.push({ text: after[key] ? `Customers on this plan gain access to ${name} straight away.` : `Customers on this plan lose access to ${name} straight away.`, affectsAccess: true });
  }
  if (before.maxVideoQuality !== after.maxVideoQuality) {
    out.push({
      text: rank(after.maxVideoQuality) < rank(before.maxVideoQuality) ? `Video is capped at ${qualityName(after.maxVideoQuality)} from the next time a customer presses play.` : `Customers can watch in ${qualityName(after.maxVideoQuality)} from the next time they press play.`,
      affectsAccess: true,
    });
  }
  if (before.maxDevices !== after.maxDevices) {
    const lower = after.maxDevices !== null && (before.maxDevices === null || after.maxDevices < before.maxDevices);
    out.push({
      text: lower ? `No new device can be added above ${plural(after.maxDevices!, "device", "devices")}. Devices already signed in stay until the customer removes them.` : after.maxDevices === null ? "Customers can add any number of devices." : `Customers can add up to ${plural(after.maxDevices, "device", "devices")}.`,
      affectsAccess: true,
    });
  }
  if (before.maxConcurrentStreams !== after.maxConcurrentStreams) {
    const lower = after.maxConcurrentStreams !== null && (before.maxConcurrentStreams === null || after.maxConcurrentStreams < before.maxConcurrentStreams);
    out.push({
      text: lower ? `From their next play, only ${plural(after.maxConcurrentStreams!, "stream", "streams")} can run at the same time. Any extra stream is refused.` : after.maxConcurrentStreams === null ? "Customers can play any number of streams at once." : `Customers can play up to ${plural(after.maxConcurrentStreams, "stream", "streams")} at once.`,
      affectsAccess: true,
    });
  }
  if (before.priceAmount !== after.priceAmount || before.billingInterval !== after.billingInterval) {
    out.push({
      text: `New price ${money(after.priceAmount)} per ${perInterval(after.billingInterval)}. Customers already on this plan keep paying their current price; the new price applies to people who subscribe or switch to it from now on.`,
      affectsAccess: false,
    });
  }
  if (before.active && !after.active) {
    out.push({ text: "New customers will no longer be able to choose this plan. People already on it keep it.", affectsAccess: false });
  }
  return out;
}
