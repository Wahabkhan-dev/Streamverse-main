import type { ItemRef, ItemType } from "./data";
import { cidFor } from "./store";
import type { SavedCard } from "./payment-methods";
import { createPersistedStore } from "./persisted";

/**
 * Everything that belongs to the signed-in customer: profile, preferences, My List, library,
 * progress, history, subscription and notification state.
 * Frontend phase: kept in this browser. A real API will replace the store, not the components.
 */

export type Role = "user" | "admin";
export type CustomerNoteKind = "New Release" | "Subscription" | "Recommendation" | "Account";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "expired";

export interface Progress {
  type: ItemType;
  slug: string;
  /** stable id of the title (MOV-000001 ...) */
  id?: string;
  /** 0-100 */
  pct: number;
  updatedAt: number;
  completed?: boolean;
  /** movies and audiobooks: seconds into the title (audiobooks: into the whole book) */
  seconds?: number;
  /** eBooks: current page */
  page?: number;
  /** audiobooks: chapter index and seconds into that chapter */
  chapter?: number;
  chapterSeconds?: number;
}
export interface HistoryEntry extends ItemRef {
  at: number;
}
export interface SavedRef extends ItemRef {
  addedAt: number;
}
export interface OwnNote {
  id: string;
  kind: CustomerNoteKind;
  t: string;
  s: string;
  at: number;
}
export interface Bill {
  id: string;
  date: string;
  plan: string;
  amount: number;
  status: "Succeeded" | "Pending" | "Failed" | "Refunded";
}
export interface UserState {
  role: Role;
  profile: { name: string; email: string; language: string; country: string; age: number; avatar: number };
  prefs: {
    preferredLanguage: string;
    subtitleLanguage: string;
    autoplayNext: boolean;
    autoplayPreview: boolean;
    notifications: { newRelease: boolean; subscription: boolean; recommendation: boolean; account: boolean; email: boolean };
    quality: string;
    subtitleDefault: string;
    audioLanguage: string;
    audiobookSpeed: number;
    readerTheme: "dark" | "sepia" | "light";
    readerFont: number;
  };
  myList: SavedRef[];
  library: SavedRef[];
  progress: Record<string, Progress>;
  history: HistoryEntry[];
  recentSearches: string[];
  bookmarks: Record<string, number[]>;
  ageConfirmed: string[];
  notif: { read: string[]; deleted: string[]; own: OwnNote[] };
  subscription: {
    plan: string;
    interval: "Monthly" | "Yearly";
    price: number;
    status: SubscriptionStatus;
    startedOn: string;
    renewsOn: string;
    pendingChange: { plan: string; price: number; interval: "Monthly" | "Yearly"; on: string } | null;
    billing: Bill[];
  };
  /** Saved cards: display data only (brand, last four, expiry). Never the full number or CVC. */
  paymentMethods: SavedCard[];
}

/**
 * What a saved reference is keyed by: the title's stable id (MOV-000001 ...), so a slug change or a
 * rename never loses My List / Library / History / progress. Falls back to the slug only when the title
 * is no longer in the catalog (it was deleted).
 */
export const refKey = (r: ItemRef) => `${r.type}:${r.id ?? cidFor(r.type, r.slug) ?? r.slug}`;
/** The same pointer with its stable id filled in (when the title exists). */
export const withId = <T extends ItemRef>(r: T): T => {
  if (r.id) return r;
  const id = cidFor(r.type, r.slug);
  return id ? { ...r, id } : r;
};
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);

const seedProgress = (type: ItemType, slug: string, pct: number, daysAgo: number, extra: Partial<Progress> = {}): Progress => ({
  type,
  slug,
  pct,
  updatedAt: NOW - daysAgo * DAY,
  ...(pct >= 100 ? { completed: true } : {}),
  ...extra,
});

const seedProg: Progress[] = [
  seedProgress("Movie", "neon-requiem", 64, 0.2, { seconds: Math.round(6960 * 0.64) }),
  seedProgress("Movie", "the-last-crown", 28, 1, { seconds: Math.round(9660 * 0.28) }),
  seedProgress("Movie", "roman-summer", 82, 2, { seconds: Math.round(6240 * 0.82) }),
  seedProgress("Movie", "glass-quiet", 100, 6),
  seedProgress("eBook", "the-quiet-tide", 41, 1, { page: 164 }),
  seedProgress("eBook", "atomic-mornings", 100, 9, { page: 400 }),
  seedProgress("Audiobook", "kingdom-of-salt", 73, 0.5, { chapter: 8, chapterSeconds: 600, seconds: 47500 }),
  seedProgress("Audiobook", "echoes-of-mars", 35, 3, { chapter: 4, chapterSeconds: 900, seconds: 14700 }),
];

const seed: UserState = {
  role: "user",
  profile: { name: "Alex Morgan", email: "alex@streamverse.tv", language: "English", country: "United States", age: 30, avatar: 0 },
  prefs: {
    preferredLanguage: "English",
    subtitleLanguage: "English",
    autoplayNext: true,
    autoplayPreview: true,
    notifications: { newRelease: true, subscription: true, recommendation: true, account: true, email: false },
    quality: "Auto",
    subtitleDefault: "Off",
    audioLanguage: "English",
    audiobookSpeed: 1,
    readerTheme: "dark",
    readerFont: 18,
  },
  myList: [],
  library: [],
  progress: Object.fromEntries(seedProg.map((p) => [refKey(p), withId(p)])),
  history: [...seedProg].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => withId({ type: p.type, slug: p.slug, at: p.updatedAt })),
  recentSearches: [],
  bookmarks: {},
  ageConfirmed: [],
  notif: {
    read: [],
    deleted: [],
    own: [
      { id: "own-1", kind: "Subscription", t: "Your Premium plan renews Oct 14", s: "$19.99 / month", at: NOW - 2 * DAY },
      { id: "own-2", kind: "Recommendation", t: "Because you watched Neon Requiem", s: "Try Glass Quiet and Velocity Zero", at: NOW - 1 * DAY },
      { id: "own-3", kind: "Account", t: "Welcome to StreamVerse", s: "Set your playback preferences in Profile", at: NOW - 30 * DAY },
    ],
  },
  subscription: {
    plan: "Premium",
    interval: "Monthly",
    price: 19.99,
    status: "active",
    startedOn: "2025-03-14",
    renewsOn: "2026-10-14",
    pendingChange: null,
    billing: [
      { id: "INV-2609", date: "2026-09-14", plan: "Premium", amount: 19.99, status: "Succeeded" },
      { id: "INV-2608", date: "2026-08-14", plan: "Premium", amount: 19.99, status: "Succeeded" },
      { id: "INV-2607", date: "2026-07-14", plan: "Premium", amount: 19.99, status: "Succeeded" },
      { id: "INV-2606", date: "2026-06-14", plan: "Premium", amount: 19.99, status: "Failed" },
      { id: "INV-2605", date: "2026-05-14", plan: "Premium", amount: 19.99, status: "Succeeded" },
      { id: "INV-2604", date: "2026-04-14", plan: "Standard", amount: 12.99, status: "Succeeded" },
    ],
  },
  paymentMethods: [
    { id: "pm-seed-visa", brand: "Visa", last4: "4242", expMonth: 8, expYear: 2028, holderName: "Alex Morgan", country: "United States", isDefault: true },
    { id: "pm-seed-mc", brand: "Mastercard", last4: "5521", expMonth: 3, expYear: 2030, holderName: "Alex Morgan", country: "United States", isDefault: false },
  ],
};

/** Older saves kept one card as { brand, last4, exp: "MM/YY" }. It becomes the default saved card. */
function reviveCards(s: Partial<UserState> & { subscription?: { paymentMethod?: { brand?: string; last4?: string; exp?: string } } }, base: SavedCard[]): SavedCard[] {
  if (Array.isArray(s.paymentMethods)) return s.paymentMethods;
  const old = s.subscription?.paymentMethod;
  if (!old?.last4) return base;
  const [mm, yy] = (old.exp ?? "").split("/");
  return [{ id: "pm-migrated", brand: (old.brand as SavedCard["brand"]) ?? "Card", last4: old.last4, expMonth: Number(mm) || 12, expYear: 2000 + (Number(yy) || 30), isDefault: true }];
}

/** Older saves pointed at titles by slug. Give every pointer the title's stable id and re-key progress / age checks. */
function reviveRefs(s: Partial<UserState>): Pick<UserState, "myList" | "library" | "history" | "progress" | "ageConfirmed"> {
  const keyed: Record<string, Progress> = {};
  for (const p of Object.values(s.progress ?? {})) {
    const q = withId(p);
    keyed[refKey(q)] = q;
  }
  return {
    myList: (s.myList ?? []).map(withId),
    library: (s.library ?? []).map(withId),
    history: (s.history ?? []).map(withId),
    progress: keyed,
    ageConfirmed: [
      ...new Set(
        (s.ageConfirmed ?? []).map((k) => {
          const [type, ...rest] = k.split(":");
          const slug = rest.join(":");
          const id = type === "Movie" || type === "eBook" || type === "Audiobook" ? cidFor(type, slug) : undefined;
          return id ? `${type}:${id}` : k;
        }),
      ),
    ],
  };
}

const store = createPersistedStore<UserState>("sv-user-v1", seed, (saved, base) => {
  const s = saved as Partial<UserState>;
  const { paymentMethod: _legacy, ...subscription } = (s.subscription ?? {}) as Record<string, unknown>;
  void _legacy;
  return {
    ...base,
    ...s,
    profile: { ...base.profile, ...(s.profile ?? {}) },
    prefs: { ...base.prefs, ...(s.prefs ?? {}), notifications: { ...base.prefs.notifications, ...(s.prefs?.notifications ?? {}) } },
    notif: { ...base.notif, ...(s.notif ?? {}) },
    subscription: { ...base.subscription, ...subscription },
    paymentMethods: reviveCards(s, base.paymentMethods),
    ...reviveRefs(s),
  };
});

export const hydrateUser = store.hydrate;
export const resetUser = store.reset;
export const getUser = store.get;
export const updateUser = store.set;
export const useUserHydrated = store.useHydrated;
export const useUser = store.use;

/* ----------------------------------------------------------------- selectors */
export const useRole = () => store.use((s) => s.role);
export const useProfile = () => store.use((s) => s.profile);
export const usePrefs = () => store.use((s) => s.prefs);
export const useMyList = () => store.use((s) => s.myList);
export const useLibrary = () => store.use((s) => s.library);
export const useProgressMap = () => store.use((s) => s.progress);
export const useHistory = () => store.use((s) => s.history);
export const useSubscription = () => store.use((s) => s.subscription);
export const useRecentSearches = () => store.use((s) => s.recentSearches);
export const useProgressOf = (r: ItemRef) => store.use((s) => s.progress[refKey(r)]);

/* ----------------------------------------------------------------- actions */
export const setRole = (role: Role) => updateUser((s) => ({ ...s, role }));

export const isSaved = (list: SavedRef[], r: ItemRef) => list.some((x) => refKey(x) === refKey(r));

function toggle(field: "myList" | "library", r: ItemRef): boolean {
  const had = isSaved(getUser()[field], r);
  updateUser((s) => ({
    ...s,
    [field]: had ? s[field].filter((x) => refKey(x) !== refKey(r)) : [withId({ type: r.type, slug: r.slug, addedAt: Date.now() }), ...s[field]],
  }));
  return !had;
}
export const toggleMyList = (r: ItemRef) => toggle("myList", r);
export const toggleLibrary = (r: ItemRef) => toggle("library", r);

/** Records where the person stopped. Also adds the title to History. */
export function saveProgress(r: ItemRef, p: Partial<Omit<Progress, "type" | "slug" | "updatedAt">>) {
  updateUser((s) => {
    const key = refKey(r);
    const prev = s.progress[key];
    const pct = Math.max(0, Math.min(100, p.pct ?? prev?.pct ?? 0));
    const next: Progress = withId({ ...prev, ...p, type: r.type, slug: r.slug, pct, updatedAt: Date.now(), completed: pct >= 97 });
    const history = [withId({ type: r.type, slug: r.slug, at: next.updatedAt }), ...s.history.filter((h) => refKey(h) !== key)];
    return { ...s, progress: { ...s.progress, [key]: next }, history };
  });
}
/** A title's address changed: the customer's saved references follow it. */
export function renameUserSlug(type: ItemType, from: string, to: string) {
  // entries that carry the stable id keep their key; only the display slug moves
  const swap = <T extends ItemRef>(r: T): T => (r.type === type && r.slug === from ? { ...r, slug: to } : r);
  updateUser((s) => {
    const progress: Record<string, Progress> = {};
    for (const [k, p] of Object.entries(s.progress)) progress[p.type === type && p.slug === from && !p.id ? refKey({ type, slug: to }) : k] = swap(p);
    const bookmarks = type === "eBook" && s.bookmarks[from] ? Object.fromEntries(Object.entries(s.bookmarks).map(([k, v]) => [k === from ? to : k, v])) : s.bookmarks;
    return {
      ...s,
      myList: s.myList.map(swap),
      library: s.library.map(swap),
      history: s.history.map(swap),
      ageConfirmed: s.ageConfirmed.map((k) => (k === `${type}:${from}` ? refKey({ type, slug: to }) : k)),
      progress,
      bookmarks,
    };
  });
}
export function removeFromHistory(r: ItemRef) {
  updateUser((s) => ({ ...s, history: s.history.filter((h) => refKey(h) !== refKey(r)) }));
}
export function addRecentSearch(q: string) {
  const t = q.trim();
  if (!t) return;
  updateUser((s) => ({ ...s, recentSearches: [t, ...s.recentSearches.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8) }));
}
export const clearRecentSearches = () => updateUser((s) => ({ ...s, recentSearches: [] }));
export function confirmAge(r: ItemRef) {
  updateUser((s) => (s.ageConfirmed.includes(refKey(r)) ? s : { ...s, ageConfirmed: [...s.ageConfirmed, refKey(r)] }));
}
export function toggleBookmark(slug: string, page: number) {
  updateUser((s) => {
    const cur = s.bookmarks[slug] ?? [];
    return { ...s, bookmarks: { ...s.bookmarks, [slug]: cur.includes(page) ? cur.filter((p) => p !== page) : [...cur, page].sort((a, b) => a - b) } };
  });
}
