import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Book, ItemRef, ItemType, Movie, Status } from "@/lib/data";
import { resolveBanner } from "@/lib/banners";
import { buildCatalog, refOf, toItem } from "@/lib/items";
import { relatedTo } from "@/lib/related";
import { matchesFilters, NO_FILTERS, searchItems } from "@/lib/search";
import { getStoreState, renameSlugInCatalog, update, type Banner, type Collection } from "@/lib/store";
import { getUser, refKey, renameUserSlug, saveProgress, toggleLibrary, toggleMyList } from "@/lib/user";
import { renderAt, resetAll } from "./utils";

beforeEach(() => resetAll("user"));
afterEach(() => cleanup());

const state = () => getStoreState();
const catalog = () => buildCatalog(state().movies, state().ebooks, state().audiobooks);

/** What the admin wizard saves: one stored record. Everything else must derive from it. */
const movie = (over: Partial<Movie> = {}): Movie => ({
  slug: "zenith-run", title: "Zenith Run", year: 2026, genres: ["Thriller"], runtime: "1h 40m", rating: "PG-13", badges: ["HD"], description: "A courier races a storm.",
  image: "/zenith.jpg", status: "Published", views: 0, release: "2026-10-01", cid: "MOV-000901", cast: [{ name: "Ines Varga", role: "Courier" }],
  info: { language: "English", tags: ["storm"] }, ...over,
});
const book = (kind: "eBook" | "Audiobook", over: Partial<Book> = {}): Book => ({
  slug: kind === "eBook" ? "salt-atlas" : "salt-atlas-audio", title: "Salt Atlas", author: "Odile Maren", genre: "Mystery", rating: 4.2, reviews: 3, pages: 200, year: 2026, description: "Maps that lie.",
  palette: ["oklch(0.3 0 0)", "oklch(0.2 0 0)", "oklch(0.7 0.2 25)"], motif: "grid", status: "Published", isbn: "x", count: 1, cid: kind === "eBook" ? "EBK-000901" : "AUD-000901",
  ...(kind === "Audiobook" ? { narrator: "Kemal Ross" } : {}), info: { language: "English", tags: ["maps"] }, ...over,
});

const setup = {
  Movie: { make: movie, add: (m: Movie) => update((s) => ({ movies: [m, ...s.movies] })), edit: (slug: string, f: Partial<Movie>) => update((s) => ({ movies: s.movies.map((m) => (m.slug === slug ? { ...m, ...f } : m)) })) },
  eBook: { make: (o?: Partial<Book>) => book("eBook", o), add: (b: Book) => update((s) => ({ ebooks: [b, ...s.ebooks] })), edit: (slug: string, f: Partial<Book>) => update((s) => ({ ebooks: s.ebooks.map((b) => (b.slug === slug ? { ...b, ...f } : b)) })) },
  Audiobook: { make: (o?: Partial<Book>) => book("Audiobook", o), add: (b: Book) => update((s) => ({ audiobooks: [b, ...s.audiobooks] })), edit: (slug: string, f: Partial<Book>) => update((s) => ({ audiobooks: s.audiobooks.map((b) => (b.slug === slug ? { ...b, ...f } : b)) })) },
} as const;

describe.each(["Movie", "eBook", "Audiobook"] as ItemType[])("%s: created once, used everywhere", (type) => {
  const S = setup[type] as { make: (o?: object) => Movie & Book; add: (x: object) => void; edit: (slug: string, f: object) => void };
  const slug = S.make().slug;
  const find = () => catalog().resolve({ type, slug });
  const status = (st: Status) => S.edit(slug, { status: st });
  const collection = (items: ItemRef[]): Collection => ({ id: "col-test", slug: "col-test", name: "Test", description: "", cover: "", items, status: "Published" });

  it("a Draft is invisible to customers; Publish makes it appear in lists, search and genre filters", () => {
    S.add(S.make({ status: "Draft" }));
    expect(catalog().listed.some((i) => i.slug === slug)).toBe(false);
    expect(searchItems(catalog().listed, "Salt Atlas Zenith", NO_FILTERS)).toHaveLength(0);
    status("Published");
    const listed = catalog().listed;
    const hit = listed.find((i) => i.slug === slug)!;
    expect(hit).toBeTruthy();
    const q = type === "Movie" ? "Zenith" : "Salt Atlas";
    expect(searchItems(listed, q, NO_FILTERS).map((i) => i.slug)).toContain(slug);
    // search also reaches people and tags saved on the same record
    expect(searchItems(listed, type === "Movie" ? "Ines Varga" : "Odile Maren", NO_FILTERS).map((i) => i.slug)).toContain(slug);
    expect(searchItems(listed, type === "Movie" ? "storm" : "maps", NO_FILTERS).map((i) => i.slug)).toContain(slug);
    expect(matchesFilters(hit, { ...NO_FILTERS, type, genre: type === "Movie" ? "Thriller" : "Mystery" })).toBe(true);
  });

  it("collection, homepage and My List hold the stable id: editing and slug changes follow the same record", () => {
    S.add(S.make());
    const ref = refOf(find()!);
    expect(ref.id).toMatch(/-000901$/);
    update((s) => ({ collections: [collection([ref]), ...s.collections], homepage: s.homepage.map((h) => (h.id === "trending_movies" ? { ...h, mode: "manual", items: [ref] } : h)) }));
    toggleMyList({ type, slug });
    toggleLibrary({ type, slug });
    saveProgress({ type, slug }, { pct: 40 });
    expect(getUser().myList[0]!.id).toBe(ref.id);
    expect(getUser().history[0]!.id).toBe(ref.id);

    // edit the title: every place shows the new title with nothing else to update
    S.edit(slug, { title: "Renamed Title" });
    const cat = catalog();
    expect(cat.resolveListed(state().collections.find((c) => c.id === "col-test")!.items).map((i) => (i.type === "Movie" ? i.m.title : i.b.title))).toEqual(["Renamed Title"]);
    expect(cat.resolveListed(getUser().myList).map((i) => i.slug)).toEqual([slug]);

    // change the slug WITHOUT any rewrite pass: the id still finds it (nothing holds only a slug)
    S.edit(slug, { slug: "new-address" });
    const moved = catalog();
    expect(moved.resolveListed(state().collections.find((c) => c.id === "col-test")!.items).map((i) => i.slug)).toEqual(["new-address"]);
    expect(moved.resolveListed(getUser().myList).map((i) => i.slug)).toEqual(["new-address"]);
    expect(moved.resolveListed(state().homepage.find((h) => h.id === "trending_movies")!.items).map((i) => i.slug)).toEqual(["new-address"]);
    expect(getUser().progress[refKey({ type, slug: "new-address" })]?.pct).toBe(40);

    // the rewrite pass the wizard also runs keeps stored slugs current and does not duplicate anything
    renameSlugInCatalog(type, slug, "new-address");
    renameUserSlug(type, slug, "new-address");
    expect(getUser().myList).toHaveLength(1);
    expect(getUser().myList[0]!.slug).toBe("new-address");
    expect(Object.keys(getUser().progress)).toContain(refKey({ type, slug: "new-address" }));
    expect(state().collections.find((c) => c.id === "col-test")!.items[0]!.slug).toBe("new-address");
  });

  it("unpublishing hides it everywhere and saved copies become Unavailable content instead of broken links", async () => {
    S.add(S.make());
    const ref = refOf(find()!);
    const banner: Banner = { id: "b-test", type: "Normal Banner", title: "", description: "", buttonText: "Go", linkKind: type === "Movie" ? "movie" : type === "eBook" ? "ebook" : "audiobook", linkId: ref.id!, linkSlug: slug, useLinked: true, image: "/placeholder.svg", mobileImage: "/placeholder.svg", priority: 1, start: "", end: "", active: true };
    update((s) => ({ collections: [collection([ref]), ...s.collections], banners: [banner, ...s.banners] }));
    toggleMyList({ type, slug });
    // while published the banner follows the title (blank title filled from the record)
    expect(resolveBanner(banner, catalog().all, state().collections)?.title).toBe(type === "Movie" ? "Zenith Run" : "Salt Atlas");

    status("Unpublished");
    const cat = catalog();
    expect(cat.listed.some((i) => i.slug === slug)).toBe(false);
    expect(searchItems(cat.listed, type === "Movie" ? "Zenith" : "Salt Atlas", NO_FILTERS)).toHaveLength(0);
    expect(cat.resolveListed(state().collections.find((c) => c.id === "col-test")!.items)).toHaveLength(0);
    expect(resolveBanner(banner, cat.all, state().collections)).toBeNull();
    expect(getUser().myList).toHaveLength(1);

    renderAt("/my-list");
    expect(await screen.findByRole("region", { name: "Unavailable content" })).toBeTruthy();
    expect(screen.queryByText(type === "Movie" ? "Zenith Run" : "Salt Atlas")).toBeNull();

    // publishing again restores everything, with the same saved reference
    act(() => status("Published"));
    expect(catalog().resolveListed(getUser().myList)).toHaveLength(1);
    expect(resolveBanner(banner, catalog().all, state().collections)).not.toBeNull();
  });

  it("deleting it leaves no broken link: references resolve to nothing and the banner drops out", () => {
    S.add(S.make());
    const ref = refOf(find()!);
    update((s) => ({ collections: [collection([ref]), ...s.collections] }));
    toggleMyList({ type, slug });
    update((s) => ({ movies: s.movies.filter((m) => m.slug !== slug), ebooks: s.ebooks.filter((b) => b.slug !== slug), audiobooks: s.audiobooks.filter((b) => b.slug !== slug) }));
    const cat = catalog();
    expect(cat.resolve(ref)).toBeUndefined();
    expect(cat.resolveListed(getUser().myList)).toHaveLength(0);
    // a later title that reuses the old slug is a different record and must not inherit the old saves
    S.add(S.make({ cid: type === "Movie" ? "MOV-000902" : type === "eBook" ? "EBK-000902" : "AUD-000902" }));
    expect(catalog().resolveListed(getUser().myList)).toHaveLength(0);
  });
});

describe("derived content", () => {
  it("related titles come from shared genres, tags, creator and language, never from the title itself", () => {
    setup.Movie.add(movie({ cid: "MOV-000901" }));
    setup.Movie.add(movie({ slug: "zenith-two", title: "Zenith Two", cid: "MOV-000902", genres: ["Thriller"], info: { language: "English", tags: ["storm"] } }));
    setup.Movie.add(movie({ slug: "other-genre", title: "Other", cid: "MOV-000903", genres: ["Documentary"], info: { language: "French", tags: [] }, cast: [] }));
    setup.Movie.add(movie({ slug: "zenith-draft", title: "Zenith Draft", cid: "MOV-000904", status: "Draft" }));
    const cat = catalog();
    const rel = relatedTo(toItem("Movie", cat.movies.find((m) => m.slug === "zenith-run")!), cat.all).map((i) => i.slug);
    expect(rel).toContain("zenith-two");
    expect(rel).not.toContain("zenith-run");
    expect(rel).not.toContain("zenith-draft");
    expect(rel).not.toContain("other-genre");
  });

  it("an item with no stored artwork never borrows another title's image", async () => {
    const { PLACEHOLDER_IMAGE } = await import("@/lib/placeholder");
    expect(PLACEHOLDER_IMAGE).toBeTruthy();
    const others = state().movies.map((m) => m.image);
    expect(others).not.toContain(PLACEHOLDER_IMAGE);
  });
});
