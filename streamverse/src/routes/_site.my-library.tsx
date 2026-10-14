import { createFileRoute, Link } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { useMemo, useState } from "react";
import { ContinueBookCard, ProgressItemCard } from "@/components/sv/ItemCard";
import { MediaRow, ProgressCard, useFakeLoad } from "@/components/sv/media";
import { EmptyState, Skel, TabBar } from "@/components/sv/ui";
import { useCatalog, toItem, type Item } from "@/lib/items";
import { runtimeSeconds, timeLeft } from "@/lib/runtime";
import { refKey, toggleLibrary, useLibrary, useProgressMap } from "@/lib/user";
import { UnavailableContent } from "@/components/sv/UnavailableContent";
import { cn } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/config";
import { useApiLibraryQuery } from "@/hooks/useApiMe";
import type { ApiListItem, ApiMovie, ApiBook } from "@/api/types";
import type { Movie, Book, ItemRef, Status } from "@/lib/data";

type Tab = "all" | "movies" | "ebooks" | "audiobooks";
type Filter = "all" | "recent" | "progress" | "completed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "recent", label: "Recently Added" },
  { id: "progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
];
const typeOf = { movies: "Movie", ebooks: "eBook", audiobooks: "Audiobook" } as const;

export const Route = createFileRoute("/_site/my-library")({
  head: () => ({
    meta: [
      { title: "My Library — StreamVerse" },
      { name: "description", content: "Pick up where you left off across movies, eBooks and audiobooks." },
      { property: "og:title", content: "My Library — StreamVerse" },
      { property: "og:description", content: "Your movies, eBooks and audiobooks in one place." },
    ],
  }),
  component: LibraryPage,
});

function apiMovieToItem(m: ApiMovie): Item {
  const mins = m.duration ?? 0;
  const h = Math.floor(mins / 60);
  const min = mins % 60;
  const movie: Movie = {
    slug: m.slug, title: m.title, year: m.year, genres: m.genres,
    runtime: h > 0 ? `${h}h ${min}m` : `${min}m`,
    rating: m.rating ?? "PG", badges: [], description: m.description,
    image: m.image, status: (m.status ?? "Published") as Status,
    views: m.views ?? 0, release: `${m.year}-01-01`,
    cast: m.cast.map((c) => ({ name: c.name, role: c.role })), cid: m.id,
  };
  return toItem("Movie", movie);
}

function apiBookToItem(b: ApiBook, type: "eBook" | "Audiobook"): Item {
  const book = {
    slug: b.slug, title: b.title, author: b.author,
    ...(b.narrator !== undefined ? { narrator: b.narrator } : {}),
    genre: b.genres[0] ?? "Fiction", rating: 4.0, reviews: 0, pages: b.pages ?? 0,
    year: b.year ?? new Date().getFullYear(), description: b.description,
    palette: ["oklch(0.3 0.05 240)", "oklch(0.2 0.05 240)", "oklch(0.8 0.1 240)"] as [string, string, string],
    motif: "sun" as const, status: (b.status ?? "Published") as Status,
    isbn: "", count: 0,
    ...(b.image ? { cover: b.image } : {}),
    cid: b.id,
  } as Book;
  return toItem(type, book);
}

function apiListItemToItem(entry: ApiListItem): Item | null {
  if (entry.contentType === "movie" && entry.movie) return apiMovieToItem(entry.movie);
  if (entry.contentType === "ebook" && entry.ebook) return apiBookToItem(entry.ebook, "eBook");
  if (entry.contentType === "audiobook" && entry.audiobook) return apiBookToItem(entry.audiobook, "Audiobook");
  return null;
}

function LibraryPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [filter, setFilter] = useState<Filter>("all");

  // Demo-mode data (always call hooks)
  const cat = useCatalog();
  const demoSaved = useLibrary();
  const progress = useProgressMap();
  const loading = useFakeLoad(350);

  // API-mode data
  const apiLibraryQuery = useApiLibraryQuery();

  // Build the library entries
  const entries = useMemo(() => {
    if (DEMO_MODE) {
      // Original demo-mode logic
      const map = new Map<string, { item: Item; addedAt: number; touched: number }>();
      for (const s of demoSaved) {
        const item = cat.resolveListed([s])[0];
        if (item) map.set(refKey(s), { item, addedAt: s.addedAt, touched: s.addedAt });
      }
      for (const p of Object.values(progress)) {
        const item = cat.resolveListed([p])[0];
        if (!item) continue;
        const prev = map.get(refKey(p));
        map.set(refKey(p), { item, addedAt: prev?.addedAt ?? 0, touched: p.updatedAt });
      }
      return [...map.values()];
    }
    // API mode: build from API library data + local progress
    const map = new Map<string, { item: Item; addedAt: number; touched: number }>();
    const apiItems = (apiLibraryQuery.data ?? [])
      .map((entry) => ({ item: apiListItemToItem(entry), addedAt: new Date(entry.addedAt).getTime() }))
      .filter((e): e is { item: Item; addedAt: number } => e.item !== null);
    for (const { item, addedAt } of apiItems) {
      map.set(refKey(item), { item, addedAt, touched: addedAt });
    }
    // Merge in local progress for continued items
    for (const p of Object.values(progress)) {
      const existing = map.get(refKey(p));
      if (existing) {
        map.set(refKey(p), { ...existing, touched: p.updatedAt });
      }
    }
    return [...map.values()];
  }, [DEMO_MODE, demoSaved, cat, progress, apiLibraryQuery.data]);

  const unavailable: ItemRef[] = useMemo(() => {
    if (DEMO_MODE) return demoSaved.filter((s) => !entries.some((e) => refKey(e.item) === refKey(s)));
    return [];
  }, [DEMO_MODE, demoSaved, entries]);

  // Loading / error states (after all hooks)
  if (!DEMO_MODE && apiLibraryQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] pt-8">
        <div className="px-4 md:px-8">
          <Skel className="h-8 w-40" />
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => <Skel key={i} className="aspect-[2/3]" />)}
          </div>
        </div>
      </div>
    );
  }
  if (!DEMO_MODE && apiLibraryQuery.isError) {
    return (
      <div className="mx-auto max-w-[1600px] pt-8">
        <div className="px-4 md:px-8">
          <h1 className="text-3xl font-bold tracking-tight">My Library</h1>
          <p className="mt-6 text-sm text-muted-foreground">Failed to load your library. Please refresh and try again.</p>
        </div>
      </div>
    );
  }

  const inProgress = (e: { item: Item }) => {
    const p = progress[refKey(e.item)];
    return !!p && !p.completed && p.pct > 0;
  };
  const continuing = (type: Item["type"]) => entries.filter((e) => e.item.type === type && inProgress(e)).sort((a, b) => b.touched - a.touched);

  const list = entries
    .filter((e) => tab === "all" || e.item.type === typeOf[tab])
    .filter((e) => {
      const p = progress[refKey(e.item)];
      if (filter === "recent") return e.addedAt > 0;
      if (filter === "progress") return inProgress(e);
      if (filter === "completed") return !!p?.completed;
      return true;
    })
    .sort((a, b) => (filter === "recent" ? b.addedAt - a.addedAt : b.touched - a.touched));

  const count = (t: Item["type"]) => entries.filter((e) => e.item.type === t).length;
  const watching = continuing("Movie");
  const reading = continuing("eBook");
  const listening = continuing("Audiobook");
  const noneStarted = watching.length + reading.length + listening.length === 0;

  return (
    <div className="mx-auto max-w-[1600px] pt-8">
      <div className="px-4 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">My Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything you've saved or started, with your place kept.</p>
      </div>

      <div className="mt-8 space-y-8">
        <MediaRow title="Continue Watching" loading={DEMO_MODE && loading} empty={watching.length === 0}>
          {watching.map(({ item }) => {
            if (item.type !== "Movie") return null;
            const p = progress[refKey(item)]!;
            return <ProgressCard key={item.slug} m={item.m} progress={p.pct} left={timeLeft(runtimeSeconds(item.m.runtime) * (1 - p.pct / 100))} />;
          })}
        </MediaRow>
        <MediaRow title="Continue Reading" loading={DEMO_MODE && loading} empty={reading.length === 0}>
          {reading.map(({ item }) => item.type === "eBook" && <ContinueBookCard key={item.slug} item={item} />)}
        </MediaRow>
        <MediaRow title="Continue Listening" loading={DEMO_MODE && loading} empty={listening.length === 0}>
          {listening.map(({ item }) => item.type === "Audiobook" && <ContinueBookCard key={item.slug} item={item} />)}
        </MediaRow>
        {!(DEMO_MODE && loading) && noneStarted && (
          <div className="px-4 md:px-8">
            <EmptyState icon={Library} title="Nothing in progress" sub="Start a movie, book or audiobook and it will appear here so you can pick it back up." />
          </div>
        )}
      </div>

      <div className="mt-12 px-4 md:px-8">
        <h2 className="text-xl font-bold">Your library</h2>
        <div className="mt-3">
          <TabBar
            label="Library type"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "all", label: "All", count: entries.length },
              { id: "movies", label: "Movies", count: count("Movie") },
              { id: "ebooks", label: "eBooks", count: count("eBook") },
              { id: "audiobooks", label: "Audiobooks", count: count("Audiobook") },
            ]}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Library filter">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={cn("h-8 rounded-full border px-4 text-xs font-semibold transition-colors", filter === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2 text-soft hover:border-foreground/30 hover:text-foreground")}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="py-8">
          {DEMO_MODE && loading ? (
            <div aria-busy="true" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skel key={i} className="aspect-[2/3]" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={Library}
              title={entries.length === 0 ? "Your library is empty" : "Nothing matches this filter"}
              sub={entries.length === 0 ? 'Add titles with “Add to Library”, or start watching, reading or listening.' : "Try another tab or filter."}
              action={
                <Link to="/" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
                  Browse StreamVerse
                </Link>
              }
            />
          ) : (
            <ul className={tab === "movies" ? "grid grid-cols-1 gap-x-3 gap-y-8 sm:grid-cols-2 lg:grid-cols-4" : "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5"}>
              {list.map(({ item }) => (
                <li key={`${item.type}-${item.slug}`} className="min-w-0">
                  <ProgressItemCard item={item} />
                </li>
              ))}
            </ul>
          )}
          {DEMO_MODE && <UnavailableContent refs={unavailable} where="My Library" onRemove={(r) => toggleLibrary(r)} />}
        </div>
      </div>
    </div>
  );
}
