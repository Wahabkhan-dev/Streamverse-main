import { useMemo } from "react";
import {
  audiobooks,
  bookGenres,
  ebooks,
  movieGenres,
  movies,
  plans,
  users,
  type Book,
  type ItemRef,
  type Movie,
} from "./data";
import { backfillIds, contentNumber, formatContentId, type IdPrefix } from "./content-id";
import { createPersistedStore } from "./persisted";
import { PLACEHOLDER_IMAGE } from "./placeholder";
import type { CustomerNoteKind } from "./user";

/**
 * The catalog and site configuration shared by the customer site and the admin console.
 * Frontend phase: kept in this browser. Components talk to the hooks below, so a real API
 * can replace this module later without touching the screens.
 */
export type User = (typeof users)[number];
export type Plan = (typeof plans)[number];
export interface Genre {
  /** never changes, even when the genre is renamed */
  id: string;
  name: string;
  /** Movie | eBook | Audiobook | All */
  type: string;
}

export const genreIdFor = (name: string) =>
  `gen-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;

const genreSeed: Genre[] = [...new Set([...movieGenres.slice(1), ...bookGenres.slice(1)])].map(
  (name) => {
    const m = movieGenres.includes(name);
    const b = bookGenres.includes(name);
    return { id: genreIdFor(name), name, type: m && b ? "All" : m ? "Movie" : "eBook" };
  },
);

export type BannerType =
  "Hero Banner" | "Normal Banner" | "Latest Release Banner" | "Promotional Banner";
export const BANNER_TYPES: BannerType[] = [
  "Hero Banner",
  "Normal Banner",
  "Latest Release Banner",
  "Promotional Banner",
];
export type LinkKind = "none" | "movie" | "ebook" | "audiobook" | "collection" | "subscription";
export interface Banner {
  id: string;
  type: BannerType;
  title: string;
  description: string;
  buttonText: string;
  linkKind: LinkKind;
  /** the linked title's / collection's stable id; `linkSlug` is only a fallback for old saves */
  linkId?: string;
  linkSlug: string;
  /** fill any field left blank (title, description, artwork) from the linked title; typed values override */
  useLinked?: boolean;
  /** desktop image */
  image: string;
  mobileImage: string;
  priority: number;
  start: string;
  end: string;
  active: boolean;
}

export type HomeSectionId =
  | "hero"
  | "continue"
  | "trending_movies"
  | "popular_movies"
  | "latest_movies"
  | "featured_ebooks"
  | "new_ebooks"
  | "featured_audiobooks"
  | "new_audiobooks"
  | "collections";
/** Which promo flag feeds a section while it's in "auto" mode. Only the Hero section exposes this in
 * admin today (Section picker), but any section could use it later without a shape change. */
export type HomeAutoFlag = "featured" | "trending" | "popular" | "newRelease";
/** The id never changes; only `title` is editable, so renaming can't break a section. */
export interface HomeSection {
  id: HomeSectionId;
  title: string;
  enabled: boolean;
  limit: number;
  mode: "auto" | "manual";
  items: ItemRef[];
  /** Defaults to "featured" (the historical Hero behavior) when unset. */
  autoFlag?: HomeAutoFlag;
}
export const HOME_DEFAULTS: { id: HomeSectionId; title: string; limit: number; manual: boolean }[] =
  [
    { id: "hero", title: "Hero Banner", limit: 4, manual: true },
    { id: "continue", title: "Continue Watching", limit: 12, manual: false },
    { id: "trending_movies", title: "Trending Movies", limit: 12, manual: true },
    { id: "popular_movies", title: "Popular Movies", limit: 12, manual: true },
    { id: "latest_movies", title: "Latest Movies", limit: 12, manual: true },
    { id: "featured_ebooks", title: "Featured eBooks", limit: 12, manual: true },
    { id: "new_ebooks", title: "New eBooks", limit: 12, manual: true },
    { id: "featured_audiobooks", title: "Featured Audiobooks", limit: 12, manual: true },
    { id: "new_audiobooks", title: "New Audiobooks", limit: 12, manual: true },
    { id: "collections", title: "Curated Collections", limit: 12, manual: false },
  ];

export interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string;
  cover: string;
  items: ItemRef[];
  status: "Published" | "Draft";
}

export interface Settings {
  maintenance: boolean;
  registration: boolean;
  autoPublish: boolean;
  ageGate: boolean;
  notifyNew: boolean;
  notifyBilling: boolean;
  autoplayNext: boolean;
  autoplayPreview: boolean;
  defaultLanguage: string;
}
export type AdminNoteKind = "Users" | "Content" | "Payments" | "Platform";
export interface AdminNote {
  id: number;
  kind: AdminNoteKind;
  t: string;
  s: string;
  time: string;
  read: boolean;
}
/** A message the admin sent to every customer. Read / deleted state is kept per customer. */
export interface Announcement {
  id: number;
  kind: CustomerNoteKind;
  t: string;
  s: string;
  at: number;
}

export interface State {
  movies: Movie[];
  ebooks: Book[];
  audiobooks: Book[];
  users: User[];
  plans: Plan[];
  genres: Genre[];
  banners: Banner[];
  homepage: HomeSection[];
  collections: Collection[];
  settings: Settings;
  adminNotes: AdminNote[];
  announcements: Announcement[];
  /** highest reference number handed out per type; only ever goes up */
  idSeq: Record<IdPrefix, number>;
}

/* ---------------------------------------------------------------- seed */
const byViews = [...movies].sort((a, b) => b.views - a.views);
const topSlugs = (n: number, from: number = 0) => byViews.slice(from, from + n).map((m) => m.slug);
const trending = topSlugs(4);
const popular = topSlugs(4, 2);

const warningsFor = (m: Movie) => {
  const w: string[] = [];
  if (m.genres.some((g) => ["Thriller", "Action"].includes(g)))
    w.push("Violence", "Strong Language");
  if (m.genres.includes("Romance")) w.push("Smoking");
  if (m.genres.includes("Sci-Fi")) w.push("Flashing Lights");
  return w;
};
const seedMovies: Movie[] = movies.map((m, i) => ({
  ...m,
  cid: formatContentId("MOV", i + 1),
  promo: {
    featured: i < 3,
    trending: trending.includes(m.slug),
    popular: popular.includes(m.slug),
    newRelease: m.year >= 2026,
  },
  restrictions: { access: "Public", warnings: warningsFor(m) },
  info: {
    language: "English",
    audio: ["English", "Spanish", "French"],
    subtitles: ["English", "Spanish", "French", "German"],
    director: m.cast[1]?.name ?? "A. Director",
    producer: m.cast[2]?.name ?? "P. Producer",
  },
}));
const enrichBooks = (list: Book[], audio: boolean): Book[] =>
  list.map((b, i) => ({
    ...b,
    promo: {
      featured: i < 4,
      newRelease: i >= list.length - 3,
      trending: i % 3 === 0,
      popular: i % 2 === 0,
    },
    restrictions: { access: "Public" },
    info: {
      language: "English",
      languages: i % 3 === 0 ? ["English", "Spanish"] : ["English"],
      publisher: "StreamVerse Press",
      readingAge: audio ? "All ages" : "12+",
      subtitle: "",
    },
  }));
const seedEbooks = enrichBooks(ebooks, false).map((b, i) => ({
  ...b,
  cid: formatContentId("EBK", i + 1),
}));
const seedAudio = enrichBooks(audiobooks, true).map((b, i) => ({
  ...b,
  cid: formatContentId("AUD", i + 1),
}));
/** a title that predates IDs keeps the number its seed entry has; anything else is numbered after the highest */
const withSeedId = <T extends { slug: string; cid?: string }>(
  list: T[],
  seedList: T[],
  prefix: "MOV" | "EBK" | "AUD",
) =>
  backfillIds(
    list.map((i) => (i.cid ? i : { ...i, cid: seedList.find((x) => x.slug === i.slug)?.cid })),
    prefix,
  );

const seedCollections: Collection[] = [
  {
    id: "award-winners",
    slug: "award-winners",
    name: "Award Winners",
    description: "Critically acclaimed stories across film and print.",
    cover: movies[2]!.image,
    status: "Published",
    items: [
      { type: "Movie", slug: "the-last-crown" },
      { type: "Movie", slug: "glass-quiet" },
      { type: "Movie", slug: "neon-requiem" },
      { type: "eBook", slug: "the-quiet-tide" },
    ],
  },
  {
    id: "best-of-sci-fi",
    slug: "best-of-sci-fi",
    name: "Best of Sci-Fi",
    description: "Dying worlds, deep oceans and the machines in between.",
    cover: movies[0]!.image,
    status: "Published",
    items: [
      { type: "Movie", slug: "crimson-horizon" },
      { type: "Movie", slug: "ember-protocol" },
      { type: "Movie", slug: "abyssal" },
      { type: "Audiobook", slug: "echoes-of-mars" },
    ],
  },
  {
    id: "family-favorites",
    slug: "family-favorites",
    name: "Family Favorites",
    description: "Warm, funny and easy to watch together.",
    cover: movies[6]!.image,
    status: "Published",
    items: [
      { type: "Movie", slug: "roman-summer" },
      { type: "eBook", slug: "little-lantern" },
      { type: "Audiobook", slug: "starlight-stories" },
    ],
  },
  {
    id: "bestselling-books",
    slug: "bestselling-books",
    name: "Bestselling Books",
    description: "The reads everyone is talking about.",
    cover: movies[4]!.image,
    status: "Published",
    items: [
      { type: "eBook", slug: "atomic-mornings" },
      { type: "eBook", slug: "ash-and-iron" },
      { type: "eBook", slug: "the-founders-map" },
      { type: "eBook", slug: "letters-to-june" },
      { type: "Audiobook", slug: "the-long-game" },
    ],
  },
];

/** Gives every pointer the stable id of the title it names, so a slug change can never break it. */
function idRefs<T extends ItemRef>(
  refs: T[],
  movieList: Movie[],
  ebookList: Book[],
  audioList: Book[],
): T[] {
  return refs.map((r) => {
    if (r.id) return r;
    const list = r.type === "Movie" ? movieList : r.type === "eBook" ? ebookList : audioList;
    const cid = list.find((x) => x.slug === r.slug)?.cid;
    return cid ? { ...r, id: cid } : r;
  });
}
const seedCollectionsWithIds = seedCollections.map((c) => ({
  ...c,
  items: idRefs(c.items, seedMovies, seedEbooks, seedAudio),
}));

const seedBannersRaw: Banner[] = [
  {
    id: "b-hero-1",
    type: "Hero Banner",
    title: "Crimson Horizon",
    description:
      "Stranded on a dying world, one commander must choose between the mission and the signal calling her home.",
    buttonText: "Watch Now",
    linkKind: "movie",
    linkSlug: "crimson-horizon",
    image: movies[0]!.image,
    mobileImage: movies[0]!.image,
    priority: 1,
    start: "2026-10-01",
    end: "2026-12-31",
    active: true,
  },
  {
    id: "b-promo-1",
    type: "Promotional Banner",
    title: "Try StreamVerse Premium",
    description: "4K HDR movies, eBooks and audiobooks in one plan.",
    buttonText: "See plans",
    linkKind: "subscription",
    linkSlug: "",
    image: movies[3]!.image,
    mobileImage: movies[3]!.image,
    priority: 2,
    start: "2026-10-01",
    end: "2026-12-31",
    active: true,
  },
  {
    id: "b-normal-1",
    type: "Normal Banner",
    title: "Award Winners",
    description: "Acclaimed films and books, gathered in one place.",
    buttonText: "Explore collection",
    linkKind: "collection",
    linkSlug: "award-winners",
    image: movies[2]!.image,
    mobileImage: movies[2]!.image,
    priority: 3,
    start: "2026-10-01",
    end: "2026-12-31",
    active: true,
  },
  {
    id: "b-latest-1",
    type: "Latest Release Banner",
    title: "Velocity Zero",
    description: "One night. One tunnel. One driver with nothing left to lose.",
    buttonText: "Watch Now",
    linkKind: "movie",
    linkSlug: "velocity-zero",
    image: movies[3]!.image,
    mobileImage: movies[3]!.image,
    priority: 4,
    start: "2026-10-01",
    end: "2026-12-31",
    active: true,
  },
  {
    id: "b-latest-2",
    type: "Latest Release Banner",
    title: "Abyssal premieres Friday",
    description: "Eleven kilometres down, something is waiting.",
    buttonText: "More info",
    linkKind: "movie",
    linkSlug: "abyssal",
    image: movies[5]!.image,
    mobileImage: movies[5]!.image,
    priority: 5,
    start: "2026-10-06",
    end: "2026-10-20",
    active: false,
  },
];

const seedBanners: Banner[] = seedBannersRaw.map((b) => {
  const linkId = linkIdFor(
    b.linkKind,
    b.linkSlug,
    seedMovies,
    seedEbooks,
    seedAudio,
    seedCollectionsWithIds,
  );
  return linkId ? { ...b, linkId } : b;
});

const seedHome: HomeSection[] = HOME_DEFAULTS.map((d) => ({
  id: d.id,
  title: d.title,
  enabled: true,
  limit: d.limit,
  mode: "auto",
  items: [],
  autoFlag: "featured",
}));

const seed: State = {
  movies: seedMovies,
  ebooks: seedEbooks,
  audiobooks: seedAudio,
  idSeq: { MOV: seedMovies.length, EBK: seedEbooks.length, AUD: seedAudio.length },
  users,
  plans,
  genres: genreSeed,
  banners: seedBanners,
  homepage: seedHome,
  collections: seedCollectionsWithIds,
  settings: {
    maintenance: false,
    registration: true,
    autoPublish: true,
    ageGate: true,
    notifyNew: true,
    notifyBilling: true,
    autoplayNext: true,
    autoplayPreview: true,
    defaultLanguage: "English",
  },
  adminNotes: [
    {
      id: 1,
      kind: "Payments",
      t: "Payment failed for Oliver Grant",
      s: "Subscription renewal was declined.",
      time: "12m",
      read: false,
    },
    {
      id: 2,
      kind: "Content",
      t: "Abyssal is scheduled for Friday",
      s: "Release goes live in 3 days.",
      time: "2h",
      read: false,
    },
    {
      id: 3,
      kind: "Payments",
      t: "124 payments pending review",
      s: "Open Payments to resolve.",
      time: "Yesterday",
      read: false,
    },
    {
      id: 4,
      kind: "Users",
      t: "Lucy Grant created an account",
      s: "Premium · United Kingdom",
      time: "Yesterday",
      read: false,
    },
    {
      id: 5,
      kind: "Platform",
      t: "Storage usage at 82%",
      s: "Media storage will need to grow soon.",
      time: "2d",
      read: true,
    },
    {
      id: 6,
      kind: "Users",
      t: "New user milestone: 48,000",
      s: "Registered users passed 48,000.",
      time: "2d",
      read: true,
    },
  ],
  announcements: [
    {
      id: 1,
      kind: "New Release",
      t: "Abyssal premieres Friday",
      s: "Added to your reminders",
      at: Date.UTC(2026, 9, 5, 10),
    },
    {
      id: 2,
      kind: "New Release",
      t: "New chapter: Kingdom of Salt",
      s: "Continue listening",
      at: Date.UTC(2026, 9, 4, 12),
    },
  ],
};

/** Banner / collection links point at the stable id of what they show. */
function linkIdFor(
  kind: LinkKind,
  slug: string,
  m: Movie[],
  e: Book[],
  a: Book[],
  cols: Collection[],
): string | undefined {
  if (kind === "movie") return m.find((x) => x.slug === slug)?.cid;
  if (kind === "ebook") return e.find((x) => x.slug === slug)?.cid;
  if (kind === "audiobook") return a.find((x) => x.slug === slug)?.cid;
  if (kind === "collection") return cols.find((x) => x.slug === slug)?.id;
  return undefined;
}

/* ---------------------------------------------------------------- migrate saved data */
const seedImage = (slug: string) => seedMovies.find((x) => x.slug === slug)?.image;

function reviveHome(saved: unknown, lists: [Movie[], Book[], Book[]]): HomeSection[] {
  const list = Array.isArray(saved) ? (saved as Record<string, unknown>[]) : [];
  return HOME_DEFAULTS.map((d) => {
    // v2 entries carry an id; v1 entries were identified by their display name
    const hit =
      list.find((s) => s["id"] === d.id) ??
      list.find((s) => s["id"] === undefined && s["name"] === d.title);
    const base = seedHome.find((x) => x.id === d.id)!;
    if (!hit) return base;
    return {
      ...base,
      title:
        typeof hit["title"] === "string" && hit["title"]
          ? (hit["title"] as string)
          : typeof hit["name"] === "string"
            ? (hit["name"] as string)
            : base.title,
      enabled: hit["enabled"] !== false,
      limit: typeof hit["limit"] === "number" ? (hit["limit"] as number) : base.limit,
      mode: hit["mode"] === "manual" ? "manual" : "auto",
      items: Array.isArray(hit["items"]) ? idRefs(hit["items"] as ItemRef[], ...lists) : [],
      autoFlag: (["featured", "trending", "popular", "newRelease"] as const).includes(
        hit["autoFlag"] as HomeAutoFlag,
      )
        ? (hit["autoFlag"] as HomeAutoFlag)
        : (base.autoFlag ?? "featured"),
    };
  });
}

function reviveBanners(
  saved: unknown,
  lists: [Movie[], Book[], Book[]],
  cols: Collection[],
): Banner[] {
  if (!Array.isArray(saved)) return seedBanners;
  return (saved as Record<string, unknown>[]).map((b, i) => {
    const old = typeof b["content"] === "string";
    const movieHit = old
      ? seedMovies.find((m) => m.title.toLowerCase() === String(b["content"]).trim().toLowerCase())
      : undefined;
    const known = seedBanners.find((x) => x.id === b["id"]);
    const type = (
      BANNER_TYPES.includes(b["type"] as BannerType) ? b["type"] : "Hero Banner"
    ) as BannerType;
    const image =
      typeof b["image"] === "string" && !(b["image"] as string).startsWith("data:") && known
        ? known.image
        : String(b["image"] ?? "");
    const kind = (b["linkKind"] as LinkKind | undefined) ?? (movieHit ? "movie" : "none");
    const slug = String(b["linkSlug"] ?? movieHit?.slug ?? "");
    const linkId =
      typeof b["linkId"] === "string"
        ? (b["linkId"] as string)
        : linkIdFor(kind, slug, ...lists, cols);
    return {
      ...(linkId ? { linkId } : {}),
      ...(b["useLinked"] === true ? { useLinked: true } : {}),
      id: typeof b["id"] === "string" ? (b["id"] as string) : `b-legacy-${i}`,
      type,
      title: String(b["title"] ?? "Banner"),
      description: String(b["description"] ?? ""),
      buttonText: String(b["buttonText"] ?? "Watch Now"),
      linkKind: (b["linkKind"] as LinkKind | undefined) ?? (movieHit ? "movie" : "none"),
      linkSlug: String(b["linkSlug"] ?? movieHit?.slug ?? ""),
      image: image || movieHit?.image || PLACEHOLDER_IMAGE,
      mobileImage: String(b["mobileImage"] ?? "") || image || movieHit?.image || PLACEHOLDER_IMAGE,
      priority: Number(b["priority"] ?? i + 1),
      start: String(b["start"] ?? ""),
      end: String(b["end"] ?? ""),
      active: b["active"] !== false,
    };
  });
}

const store = createPersistedStore<State>(
  "sv-store-v2",
  seed,
  (saved, base) => {
    const s = saved as Partial<State> & Record<string, unknown>;
    const movies = s.movies
      ? withSeedId(s.movies, seedMovies, "MOV").map((m) => ({
          ...m,
          image: !m.image.startsWith("data:") && seedImage(m.slug) ? seedImage(m.slug)! : m.image,
        }))
      : base.movies;
    const ebooks = s.ebooks ? withSeedId(s.ebooks, seedEbooks, "EBK") : base.ebooks;
    const audiobooks = s.audiobooks ? withSeedId(s.audiobooks, seedAudio, "AUD") : base.audiobooks;
    const top = (list: { cid?: string }[]) =>
      list.reduce((m, i) => Math.max(m, contentNumber(i.cid)), 0);
    return {
      ...base,
      ...s,
      movies,
      ebooks,
      audiobooks,
      idSeq: {
        MOV: Math.max(s.idSeq?.MOV ?? 0, top(movies)),
        EBK: Math.max(s.idSeq?.EBK ?? 0, top(ebooks)),
        AUD: Math.max(s.idSeq?.AUD ?? 0, top(audiobooks)),
      },
      banners: reviveBanners(
        s.banners,
        [movies, ebooks, audiobooks],
        s.collections ?? base.collections,
      ),
      homepage: reviveHome(s.homepage, [movies, ebooks, audiobooks]),
      genres: (s.genres ?? base.genres).map((g) => ({ ...g, id: g.id ?? genreIdFor(g.name) })),
      collections: (s.collections ?? base.collections).map((c) => ({
        ...c,
        items: idRefs(c.items, movies, ebooks, audiobooks),
      })),
      settings: { ...base.settings, ...(s.settings ?? {}) },
      adminNotes: (s.adminNotes ?? base.adminNotes).map((n, i) => ({
        ...n,
        kind: n.kind ?? base.adminNotes[i]?.kind ?? "Content",
      })),
      announcements: (s.announcements ?? base.announcements).map((a) => ({
        ...a,
        kind: a.kind ?? "New Release",
        at: typeof a.at === "number" ? a.at : Date.now(),
      })),
    };
  },
  ["sv-store-v1"],
);

/** The stable id of a title, from its type and current slug. Undefined when it is not in the catalog. */
export function cidFor(type: "Movie" | "eBook" | "Audiobook", slug: string): string | undefined {
  const s = store.get();
  return (type === "Movie" ? s.movies : type === "eBook" ? s.ebooks : s.audiobooks).find(
    (x) => x.slug === slug,
  )?.cid;
}

export const getStoreState = store.get;
export const hydrateStore = store.hydrate;
export const resetStore = store.reset;
export const useStoreHydrated = store.useHydrated;
export function update(fn: (s: State) => Partial<State>) {
  store.set((s) => ({ ...s, ...fn(s) }));
}

export const useIdSeq = () => store.use((s) => s.idSeq);
/** Marks a reference number as used so no later title can be given it again, even if this one is deleted. */
export function reserveContentId(cid: string) {
  const prefix = cid.split("-")[0] as IdPrefix;
  const n = contentNumber(cid);
  if (!n || !(prefix in store.get().idSeq) || store.get().idSeq[prefix] >= n) return;
  update((s) => ({ idSeq: { ...s.idSeq, [prefix]: n } }));
}

/** A title's address changed: everything in the catalog that pointed at the old one follows it. */
export function renameSlugInCatalog(
  type: "Movie" | "eBook" | "Audiobook",
  from: string,
  to: string,
) {
  const swap = <T extends { type: string; slug: string }>(r: T): T =>
    r.type === type && r.slug === from ? { ...r, slug: to } : r;
  const kind: LinkKind = type === "Movie" ? "movie" : type === "eBook" ? "ebook" : "audiobook";
  update((s) => ({
    collections: s.collections.map((c) => ({ ...c, items: c.items.map(swap) })),
    homepage: s.homepage.map((h) => ({ ...h, items: h.items.map(swap) })),
    banners: s.banners.map((b) =>
      b.linkKind === kind && b.linkSlug === from ? { ...b, linkSlug: to } : b,
    ),
  }));
}

export const useMovies = () => store.use((s) => s.movies);
export const useEbooks = () => store.use((s) => s.ebooks);
export const useAudiobooks = () => store.use((s) => s.audiobooks);
export const useUsers = () => store.use((s) => s.users);
export const usePlans = () => store.use((s) => s.plans);
export const useGenres = () => store.use((s) => s.genres);
export const useBanners = () => store.use((s) => s.banners);
export const useHomepage = () => store.use((s) => s.homepage);
export const useCollections = () => store.use((s) => s.collections);
export const useSettings = () => store.use((s) => s.settings);
export const useAdminNotes = () => store.use((s) => s.adminNotes);
export const useAnnouncements = () => store.use((s) => s.announcements);

/** Genre filter pills for a content type: "All" first, then admin-managed genres that apply. */
export function useGenreNames(kind: "Movie" | "eBook" | "Audiobook"): string[] {
  const genres = useGenres();
  return useMemo(
    () => [
      "All",
      ...genres
        .filter(
          (g) =>
            g.type === "All" || g.type === kind || (g.type === "eBook" && kind === "Audiobook"),
        )
        .map((g) => g.name),
    ],
    [genres, kind],
  );
}

export const slugify = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
