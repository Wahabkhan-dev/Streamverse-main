import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, Search as SearchIcon, SearchX, SlidersHorizontal, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ItemCard } from "@/components/sv/ItemCard";
import { SearchField } from "@/components/sv/SearchField";
import { Btn, EmptyState, Skel, useRovingTabs } from "@/components/sv/ui";
import { itemAge, itemGenres, itemLanguage, useCatalog, type Item } from "@/lib/items";
import { NO_FILTERS, filtersActive, peopleOf, searchItems, searchPeople, type Filters } from "@/lib/search";
import { useGenres } from "@/lib/store";
import { addRecentSearch, clearRecentSearches, useRecentSearches } from "@/lib/user";
import { cn } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/config";
import { searchApi } from "@/api/search.api";
import type { ApiMovie, ApiBook } from "@/api/types";
import type { Movie, Book, Status } from "@/lib/data";
import { toItem } from "@/lib/items";

type Tab = "all" | "movies" | "ebooks" | "audiobooks" | "people";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "movies", label: "Movies" },
  { id: "ebooks", label: "eBooks" },
  { id: "audiobooks", label: "Audiobooks" },
  { id: "people", label: "People" },
];

export const Route = createFileRoute("/_site/search")({
  validateSearch: (s: Record<string, unknown>): { q?: string; tab?: Tab } => ({
    ...(typeof s["q"] === "string" && s["q"] ? { q: s["q"] } : {}),
    ...(TABS.some((t) => t.id === s["tab"]) && s["tab"] !== "all" ? { tab: s["tab"] as Tab } : {}),
  }),
  head: () => ({ meta: [{ title: "Search — StreamVerse" }, { name: "description", content: "Search movies, eBooks, audiobooks, authors, actors and narrators." }] }),
  component: SearchPage,
});

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</span>
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-surface-2 px-2 text-sm focus:border-primary focus:outline-none">
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  </label>
);

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
    cast: m.cast.map((c) => ({ name: c.name, role: c.role })),
    ...(m.promo !== undefined ? { promo: m.promo } : {}),
    cid: m.id,
  } as Movie;
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

function SearchPage() {
  const { q = "", tab = "all" } = Route.useSearch();
  const navigate = useNavigate();
  const cat = useCatalog();
  const genres = useGenres();
  const recent = useRecentSearches();
  const [text, setText] = useState(q);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const debounced = useDebounced(text, 300);
  const loading = text !== debounced;
  const applied = debounced.trim();

  // API search query (only enabled in real mode when there's a query)
  const apiSearchQuery = useQuery({
    queryKey: ["search", applied] as const,
    queryFn: async () => {
      const res = await searchApi.search(applied);
      return res.data;
    },
    enabled: !DEMO_MODE && applied.length > 0,
    staleTime: 30 * 1000,
  });

  // keep the address in sync with what was typed
  useEffect(() => {
    if (debounced.trim() === q) return;
    navigate({ to: "/search", search: { ...(debounced.trim() ? { q: debounced.trim() } : {}), ...(tab !== "all" ? { tab } : {}) }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // a query typed elsewhere (navbar, suggestion) arrives through the address
  useEffect(() => {
    setText(q);
  }, [q]);

  const people = useMemo(() => peopleOf(cat.listed), [cat.listed]);

  // Build results: demo mode uses local search, API mode uses search API
  const results: Item[] = useMemo(() => {
    if (DEMO_MODE) return searchItems(cat.listed, applied, filters);
    if (!applied) return [];
    const apiData = apiSearchQuery.data;
    if (!apiData) return [];
    const items: Item[] = [
      ...(apiData.movies ?? []).map(apiMovieToItem),
      ...(apiData.ebooks ?? []).map((b) => apiBookToItem(b, "eBook")),
      ...(apiData.audiobooks ?? []).map((b) => apiBookToItem(b, "Audiobook")),
    ];
    // Apply local filters to API results
    return searchItems(items, "", filters); // empty string = no text filter (API already filtered)
  }, [DEMO_MODE, cat.listed, applied, filters, apiSearchQuery.data]);

  const peopleHits = useMemo(() => {
    if (DEMO_MODE) return searchPeople(people, applied);
    // In API mode, people search is not supported via the API; use local catalog people
    return searchPeople(people, applied);
  }, [DEMO_MODE, people, applied, cat.listed]);

  const genreHits = useMemo(() => (applied ? genres.map((g) => g.name).filter((g) => g.toLowerCase().includes(applied.toLowerCase())) : []), [genres, applied]);

  const counts: Record<Tab, number> = {
    all: results.length + peopleHits.length,
    movies: results.filter((i) => i.type === "Movie").length,
    ebooks: results.filter((i) => i.type === "eBook").length,
    audiobooks: results.filter((i) => i.type === "Audiobook").length,
    people: peopleHits.length,
  };

  const opts = useMemo(() => {
    const uniq = (xs: string[]) => ["Any", ...[...new Set(xs)].sort()];
    const sourceList = DEMO_MODE ? cat.listed : results;
    return {
      genre: uniq(sourceList.flatMap(itemGenres)),
      language: uniq(sourceList.map(itemLanguage)),
      age: uniq(sourceList.map(itemAge)),
    };
  }, [DEMO_MODE, cat.listed, results]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const tabProps = useRovingTabs(TABS.length);
  const setTab = (t: Tab) => navigate({ to: "/search", search: { ...(q ? { q } : {}), ...(t !== "all" ? { tab: t } : {}) }, replace: true });
  const runSearch = (term: string) => {
    addRecentSearch(term);
    setText(term);
    navigate({ to: "/search", search: { q: term } });
  };

  const group = (type: Item["type"]) => results.filter((i) => i.type === type);
  const grid = "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
  const gridWide = "grid grid-cols-1 gap-x-3 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  // In API mode, show loading while searching
  const isSearching = !DEMO_MODE && applied && (loading || apiSearchQuery.isLoading);

  const peopleList = (list: typeof peopleHits) => (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((p) => (
        <li key={`${p.role}-${p.name}`}>
          <button type="button" onClick={() => runSearch(p.name)} className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left hover:border-foreground/25">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-red-grad text-sm font-bold">{p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block text-xs text-muted-foreground">{p.role} · {p.titles.length} {p.titles.length === 1 ? "title" : "titles"}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Search</h1>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SearchField id="search-page-input" label="Search all titles and people" value={text} onChange={setText} onSubmit={runSearch} className="w-full max-w-2xl flex-1" inputClassName="h-11 text-base" autoFocus={!q} />
        <Btn type="button" variant="outline" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal /> Filters{filtersActive(filters) ? " •" : ""}
        </Btn>
      </div>

      {showFilters && (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6">
          <Select label="Content Type" value={filters.type} onChange={(v) => set("type", v as Filters["type"])} options={["All", "Movie", "eBook", "Audiobook"]} />
          <Select label="Genre" value={filters.genre} onChange={(v) => set("genre", v)} options={opts.genre} />
          <Select label="Language" value={filters.language} onChange={(v) => set("language", v)} options={opts.language} />
          <Select label="Release Date" value={filters.release} onChange={(v) => set("release", v as Filters["release"])} options={["Any", "2026", "2025", "2024", "Older"]} />
          <Select label="Rating" value={filters.rating} onChange={(v) => set("rating", v as Filters["rating"])} options={["Any", "4.5+", "4+", "3.5+"]} />
          <Select label="Age Rating" value={filters.age} onChange={(v) => set("age", v)} options={opts.age} />
          <div className="col-span-2 flex items-end sm:col-span-3 lg:col-span-6">
            <Btn type="button" size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)} disabled={!filtersActive(filters)}>
              Reset filters
            </Btn>
          </div>
        </div>
      )}

      {!applied && !loading ? (
        <div className="mt-10 space-y-8">
          {recent.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Clock className="size-4 text-muted-foreground" /> Recent searches
                </h2>
                <button type="button" onClick={clearRecentSearches} className="text-xs font-semibold text-primary-text">
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button key={r} type="button" onClick={() => runSearch(r)} className="rounded-full border border-border bg-surface-2 px-4 py-1.5 text-sm hover:border-foreground/30">
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-3 text-lg font-bold">Browse by genre</h2>
            <div className="flex flex-wrap gap-2">
              {genres.map((g) => (
                <button key={g.name} type="button" onClick={() => runSearch(g.name)} className="rounded-full border border-border bg-surface-2 px-4 py-1.5 text-sm hover:border-primary hover:text-foreground">
                  {g.name}
                </button>
              ))}
            </div>
          </section>
          <EmptyState icon={SearchIcon} title="Search StreamVerse" sub="Find movies, eBooks and audiobooks by title, author, actor, narrator or genre." />
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Result type" className="no-scrollbar mt-6 flex gap-5 overflow-x-auto border-b border-border">
            {TABS.map((t, i) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} {...tabProps(i, tab === t.id, (to) => setTab(TABS[to]!.id))} onClick={() => setTab(t.id)} className={cn("relative shrink-0 py-3 text-sm font-bold tracking-wider uppercase", tab === t.id ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground")}>
                {t.label} {!isSearching && <span className="ml-1 text-xs font-medium text-muted-foreground">{counts[t.id]}</span>}
              </button>
            ))}
          </div>

          <div className="py-8" aria-live="polite">
            {isSearching ? (
              <div aria-busy="true" className={grid}>
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i}>
                    <Skel className="aspect-[2/3]" />
                    <Skel className="mt-2 h-4 w-2/3" />
                  </div>
                ))}
              </div>
            ) : counts[tab] === 0 ? (
              <div>
                <EmptyState
                  icon={SearchX}
                  title={`No results for "${applied}"`}
                  sub={filtersActive(filters) ? "Try removing a filter or checking the spelling." : "Check the spelling or try a broader word, like a genre or an author."}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      {filtersActive(filters) && <Btn onClick={() => setFilters(NO_FILTERS)}>Reset filters</Btn>}
                      <Btn onClick={() => setText("")}>Clear search</Btn>
                    </div>
                  }
                />
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {genres.slice(0, 6).map((g) => (
                    <button key={g.name} type="button" onClick={() => runSearch(g.name)} className="rounded-full border border-border bg-surface-2 px-4 py-1.5 text-sm hover:border-primary">
                      Try {g.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-10">
                {(tab === "all" || tab === "people") && peopleHits.length > 0 && (
                  <section>
                    <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                      <User className="size-4 text-muted-foreground" /> People
                    </h2>
                    {peopleList(tab === "all" ? peopleHits.slice(0, 6) : peopleHits)}
                  </section>
                )}
                {tab === "all" && genreHits.length > 0 && (
                  <section>
                    <h2 className="mb-3 text-lg font-bold">Genres</h2>
                    <div className="flex flex-wrap gap-2">
                      {genreHits.map((g) => (
                        <button key={g} type="button" onClick={() => runSearch(g)} className="rounded-full border border-border bg-surface-2 px-4 py-1.5 text-sm hover:border-primary">
                          {g}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {(tab === "all" || tab === "movies") && counts.movies > 0 && (
                  <section aria-label="Movies">
                    <h2 className="mb-3 text-lg font-bold">Movies</h2>
                    <div className={gridWide}>
                      {group("Movie").map((i) => (
                        <ItemCard key={i.slug} item={i} fixed={false} />
                      ))}
                    </div>
                  </section>
                )}
                {(tab === "all" || tab === "ebooks") && counts.ebooks > 0 && (
                  <section aria-label="eBooks">
                    <h2 className="mb-3 text-lg font-bold">eBooks</h2>
                    <div className={grid}>
                      {group("eBook").map((i) => (
                        <ItemCard key={i.slug} item={i} fixed={false} />
                      ))}
                    </div>
                  </section>
                )}
                {(tab === "all" || tab === "audiobooks") && counts.audiobooks > 0 && (
                  <section aria-label="Audiobooks">
                    <h2 className="mb-3 text-lg font-bold">Audiobooks</h2>
                    <div className={grid}>
                      {group("Audiobook").map((i) => (
                        <ItemCard key={i.slug} item={i} fixed={false} />
                      ))}
                    </div>
                  </section>
                )}
                {tab === "people" && peopleHits.some((p) => p.titles.length) && (
                  <p className="text-xs text-muted-foreground">Select a person to see their titles.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
