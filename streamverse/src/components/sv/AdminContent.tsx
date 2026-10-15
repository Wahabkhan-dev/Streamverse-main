import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Check, Eye, EyeOff, FilePen, Filter, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fmt, type Book, type Movie, type Status } from "@/lib/data";
import { runtimeSeconds } from "@/lib/runtime";
import { deleteDraft, editDraftId, isEditDraft, newDraftId, useDrafts, useDraftsHydrated, type DraftRec } from "@/lib/drafts";
import { update, useAudiobooks, useEbooks, useGenreNames, useMovies } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BookCover } from "./media";
import { SearchBox, td, th, tr } from "./admin";
import { Btn, ConfirmDialog, EmptyState, PageHeader, Panel, Skel, StatusBadge } from "./ui";
import { AudiobookWizard } from "./wizard/AudiobookWizard";
import { EbookWizard } from "./wizard/EbookWizard";
import { MovieWizard } from "./wizard/MovieWizard";
import { formatSchedule } from "./wizard/shared";
import { DEMO_MODE } from "@/lib/config";
import {
  useAdminMoviesQuery, useAdminMovieMutation,
  useAdminEbooksQuery, useAdminEbookMutation,
  useAdminAudiobooksQuery, useAdminAudiobookMutation,
} from "@/hooks/useAdminApi";
import type { ApiMovie, ApiBook } from "@/api/types";

// Mappers from API types to store types (used in !DEMO_MODE for list display)
function apiMovieToMovie(m: ApiMovie): Movie {
  return {
    slug: m.slug,
    title: m.title,
    year: m.year,
    genres: m.genres,
    runtime: m.duration ? `${Math.floor(m.duration / 60)}m` : "",
    rating: m.rating ?? "",
    badges: [],
    description: m.description,
    image: m.image,
    status: (m.status ?? "Draft") as Status,
    views: m.views ?? 0,
    release: m.createdAt?.slice(0, 10) ?? "",
    cast: (m.cast ?? []).map((c) => ({ name: c.name, role: c.role })),
    cid: m.id,
    meta: m.rating ? { "Age Rating": m.rating } : {},
    ...(m.restrictions?.access ? { restrictions: { access: m.restrictions.access === "Subscription" ? "Subscribers Only" as const : m.restrictions.access === "Purchase" ? "Subscribers Only" as const : "Public" as const } } : {}),
    ...(m.promo != null ? { promo: m.promo } : {}),
    ...(m.createdAt != null ? { createdAt: m.createdAt } : {}),
    ...(m.updatedAt != null ? { updatedAt: m.updatedAt } : {}),
  };
}

function apiBookToBook(b: ApiBook): Book {
  const FALLBACK_PALETTE: [string, string, string] = ["oklch(20% 0.05 240)", "oklch(15% 0.05 240)", "oklch(80% 0.05 240)"];
  return {
    slug: b.slug,
    title: b.title,
    author: b.author,
    ...(b.narrator != null ? { narrator: b.narrator } : {}),
    genre: b.genres[0] ?? "",
    rating: 4,
    reviews: 0,
    pages: b.pages ?? 0,
    ...(b.duration != null ? { duration: `${Math.floor(b.duration / 3600)}h ${Math.floor((b.duration % 3600) / 60)}m` } : {}),
    year: b.year ?? new Date().getFullYear(),
    description: b.description,
    palette: FALLBACK_PALETTE,
    motif: "line",
    status: (b.status ?? "Draft") as Status,
    isbn: "",
    count: 0,
    cid: b.id,
    ...(b.restrictions?.access ? { restrictions: { access: b.restrictions.access === "Subscription" ? "Subscribers Only" as const : b.restrictions.access === "Purchase" ? "Subscribers Only" as const : "Public" as const } } : {}),
    ...(b.promo != null ? { promo: b.promo } : {}),
    ...(b.createdAt != null ? { createdAt: b.createdAt } : {}),
    ...(b.updatedAt != null ? { updatedAt: b.updatedAt } : {}),
  };
}

export type ContentType = "Movie" | "eBook" | "Audiobook";
const base = { Movie: "movies", eBook: "ebooks", Audiobook: "audiobooks" } as const;
const plural = { Movie: "Movies", eBook: "eBooks", Audiobook: "Audiobooks" } as const;
const noun = { Movie: "movie", eBook: "eBook", Audiobook: "audiobook" } as const;
const key = { Movie: "movies", eBook: "ebooks", Audiobook: "audiobooks" } as const;

const useStoreItems = (type: ContentType): (Movie | Book)[] => {
  const m = useMovies();
  const e = useEbooks();
  const a = useAudiobooks();
  return type === "Movie" ? m : type === "eBook" ? e : a;
};

function setItems(type: ContentType, fn: (old: (Movie | Book)[]) => (Movie | Book)[]) {
  update((s) => ({ [key[type]]: fn(s[key[type]] as (Movie | Book)[]) }) as never);
}

/** Status plus the detail an admin needs at a glance: when it is scheduled for, and whether access is restricted. */
function StatusCell({ e }: { e: Movie | Book }) {
  const access = e.restrictions?.access;
  return (
    <div className="space-y-1">
      <StatusBadge status={e.status} />
      {e.status === "Scheduled" && e.publishAt && <div className="text-[11px] text-info">Scheduled for: {formatSchedule(e.publishAt)}</div>}
      {access && access !== "Public" && <div className="text-[11px] text-muted-foreground">{access}</div>}
    </div>
  );
}

const Thumb = ({ type, it }: { type: ContentType; it: Movie | Book }) =>
  type === "Movie" ? <img src={(it as Movie).image} alt="" className="h-9 w-16 shrink-0 rounded object-cover" /> : <BookCover b={it as Book} square className="w-9 shrink-0 rounded" />;

/* ================================================================ list */

type SortKey = "title" | "genre" | "age" | "release" | "views" | "author" | "isbn" | "added" | "duration" | "status";
interface Col {
  key: SortKey;
  label: string;
  /** what the column sorts by */
  sort: (i: Movie | Book) => string | number;
  cell: (i: Movie | Book) => React.ReactNode;
}
interface FilterDef {
  id: string;
  label: string;
  options: string[];
  /** true when the title passes the chosen value */
  match: (i: Movie | Book, v: string) => boolean;
}

const uniq = (xs: (string | number | undefined)[]) => [...new Set(xs.filter((x) => x !== undefined && x !== "").map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const hours = (b: Book) => runtimeSeconds(b.duration, 0) / 3600;
const DURATIONS: Record<string, (h: number) => boolean> = { "Under 5 hours": (h) => h < 5, "5 to 10 hours": (h) => h >= 5 && h <= 10, "Over 10 hours": (h) => h > 10 };

/** The columns shown for each type, with the filters that belong to those columns. */
function listConfig(type: ContentType, items: (Movie | Book)[], genres: string[]): { cols: Col[]; filters: FilterDef[]; search: (i: Movie | Book) => string; placeholder: string } {
  const mv = (i: Movie | Book) => i as Movie;
  const bk = (i: Movie | Book) => i as Book;
  const status: FilterDef = { id: "status", label: "Status", options: ["Published", "Draft", "Scheduled", "Unpublished", "Archived"], match: (i, v) => i.status === v };
  const genreOf = (i: Movie | Book) => (type === "Movie" ? mv(i).genres : [bk(i).genre]);
  const genre: FilterDef = { id: "genre", label: "Genre", options: genres, match: (i, v) => genreOf(i).includes(v) };
  const statusCol: Col = { key: "status", label: "Status", sort: (i) => i.status, cell: (i) => <StatusCell e={i} /> };
  const title: Col = {
    key: "title",
    label: "Title",
    sort: (i) => i.title.toLowerCase(),
    cell: (i) => (
      <div className="flex min-w-0 items-center gap-3">
        <Thumb type={type} it={i} />
        <span className="truncate font-semibold">{i.title}</span>
      </div>
    ),
  };
  const soft = (v: React.ReactNode) => <span className="text-soft">{v}</span>;
  if (type === "Movie") {
    const ageOf = (i: Movie | Book) => i.meta?.["Age Rating"] ?? mv(i).rating;
    return {
      placeholder: "Search movies by title or genre...",
      search: (i) => `${i.title} ${mv(i).genres.join(" ")}`,
      cols: [
        title,
        { key: "genre", label: "Genre", sort: (i) => mv(i).genres.join(", "), cell: (i) => soft(mv(i).genres.join(", ")) },
        { key: "age", label: "Age rating", sort: ageOf, cell: (i) => soft(ageOf(i)) },
        { key: "release", label: "Release date", sort: (i) => mv(i).release, cell: (i) => soft(mv(i).release) },
        statusCol,
        { key: "views", label: "Views", sort: (i) => mv(i).views, cell: (i) => soft(fmt(mv(i).views)) },
      ],
      filters: [
        status,
        genre,
        { id: "age", label: "Age rating", options: uniq(items.map(ageOf)), match: (i, v) => ageOf(i) === v },
        { id: "year", label: "Release year", options: uniq(items.map((i) => mv(i).year)).reverse(), match: (i, v) => String(mv(i).year) === v },
      ],
    };
  }
  if (type === "eBook") {
    const added = (i: Movie | Book) => i.meta?.["Publication Date"] ?? (bk(i).year > 0 ? String(bk(i).year) : "Not specified");
    return {
      placeholder: "Search eBooks by title, author or ISBN...",
      search: (i) => `${i.title} ${bk(i).author} ${bk(i).isbn}`,
      cols: [
        title,
        { key: "author", label: "Author", sort: (i) => bk(i).author, cell: (i) => soft(bk(i).author) },
        { key: "genre", label: "Genre", sort: (i) => bk(i).genre, cell: (i) => soft(bk(i).genre) },
        { key: "isbn", label: "ISBN", sort: (i) => bk(i).isbn, cell: (i) => <span className="font-mono text-xs text-soft">{bk(i).isbn || "-"}</span> },
        statusCol,
        { key: "views", label: "Reads", sort: (i) => bk(i).count, cell: (i) => soft(fmt(bk(i).count)) },
        { key: "added", label: "Added date", sort: added, cell: (i) => soft(added(i)) },
      ],
      filters: [status, genre, { id: "author", label: "Author", options: uniq(items.map((i) => bk(i).author)), match: (i, v) => bk(i).author === v }, { id: "year", label: "Added year", options: uniq(items.map((i) => added(i).slice(0, 4)).filter((y) => /^\d{4}$/.test(y))).reverse(), match: (i, v) => added(i).startsWith(v) }],
    };
  }
  return {
    placeholder: "Search audiobooks by title, author or narrator...",
    search: (i) => `${i.title} ${bk(i).author} ${bk(i).narrator ?? ""}`,
    cols: [
      title,
      {
        key: "author",
        label: "Author / Narrator",
        sort: (i) => bk(i).author,
        cell: (i) => (
          <span className="text-soft">
            {bk(i).author}
            <span className="block text-xs text-muted-foreground">Narrated by {bk(i).narrator ?? "-"}</span>
          </span>
        ),
      },
      { key: "duration", label: "Duration", sort: (i) => hours(bk(i)), cell: (i) => soft(bk(i).duration ?? "-") },
      { key: "genre", label: "Genre", sort: (i) => bk(i).genre, cell: (i) => soft(bk(i).genre) },
      statusCol,
      { key: "views", label: "Listens", sort: (i) => bk(i).count, cell: (i) => soft(fmt(bk(i).count)) },
    ],
    filters: [
      status,
      genre,
      { id: "person", label: "Author / Narrator", options: uniq(items.flatMap((i) => [bk(i).author, bk(i).narrator])), match: (i, v) => bk(i).author === v || bk(i).narrator === v },
      { id: "duration", label: "Duration", options: Object.keys(DURATIONS), match: (i, v) => DURATIONS[v]!(hours(bk(i))) },
    ],
  };
}

export function AdminContentList({ type, q: initialQ = "" }: { type: ContentType; q?: string }) {
  const storeItems = useStoreItems(type);

  // Real API hooks (all three always called; enabled: !DEMO_MODE internally)
  const moviesQ = useAdminMoviesQuery();
  const ebooksQ = useAdminEbooksQuery();
  const audiobooksQ = useAdminAudiobooksQuery();
  const movieMut = useAdminMovieMutation();
  const ebookMut = useAdminEbookMutation();
  const audiobookMut = useAdminAudiobookMutation();

  const apiQuery = type === "Movie" ? moviesQ : type === "eBook" ? ebooksQ : audiobooksQ;
  const apiMut = type === "Movie" ? movieMut : type === "eBook" ? ebookMut : audiobookMut;

  const apiItems: (Movie | Book)[] = useMemo(() => {
    if (!apiQuery.data?.data) return [];
    if (type === "Movie") return (apiQuery.data.data as ApiMovie[]).map(apiMovieToMovie);
    return (apiQuery.data.data as ApiBook[]).map(apiBookToBook);
  }, [apiQuery.data, type]);

  const isLoading = !DEMO_MODE && apiQuery.isLoading;
  const isError = !DEMO_MODE && apiQuery.isError;
  const items: (Movie | Book)[] = DEMO_MODE ? storeItems : apiItems;

  const genreNames = useGenreNames(type).slice(1);
  const [q, setQ] = useState(initialQ);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [del, setDel] = useState<Movie | Book | null>(null);
  const cfg = useMemo(() => listConfig(type, items, genreNames), [type, items, genreNames]);
  const drafts = useDrafts().filter((d) => d.type === type && !isEditDraft(d));
  const [filtersOpen, setFiltersOpen] = useState(true);

  const setStatusOf = (i: Movie | Book, next: Status) => {
    setItems(type, (o) => o.map((x) => (x.slug === i.slug ? { ...x, status: next } : x)));
    toast.success(`${i.title} · ${next}`);
  };
  const active = Object.values(chosen).filter(Boolean).length + (q ? 1 : 0);
  const clear = () => {
    setChosen({});
    setQ("");
    setSort(null);
  };

  let list = items.filter((i) => cfg.search(i).toLowerCase().includes(q.trim().toLowerCase()) && cfg.filters.every((f) => !chosen[f.id] || f.match(i, chosen[f.id]!)));
  if (sort) {
    const col = cfg.cols.find((c) => c.key === sort.key);
    if (col) {
      list = [...list].sort((a, b) => {
        const x = col.sort(a);
        const y = col.sort(b);
        const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return sort.dir === "asc" ? r : -r;
      });
    }
  }
  const toggleSort = (key: SortKey) => setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  const published = items.filter((i) => i.status === "Published").length;
  const icon = "grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3 hover:text-foreground";
  const live = (i: Movie | Book) => i.status === "Published" || i.status === "Archived" || i.status === "Unpublished";

  const actions = (i: Movie | Book) => (
    <div className="inline-flex gap-0.5">
      {live(i) ? (
        <Link to={`/admin/${base[type]}/$slug/stats` as "/admin/movies/$slug/stats"} params={{ slug: i.slug }} className={icon} title="View stats" aria-label={`View stats for ${i.title}`}>
          <BarChart3 className="size-3.5" />
        </Link>
      ) : (
        <button type="button" disabled className={cn(icon, "opacity-30")} title="Stats appear once the title is published" aria-label={`Stats for ${i.title} are available once it is published`}>
          <BarChart3 className="size-3.5" />
        </button>
      )}
      <Link to={`/admin/${base[type]}/$slug/edit` as "/admin/movies/$slug/edit"} params={{ slug: i.slug }} className={icon} title="Edit title" aria-label={`Edit ${i.title}`}>
        <Pencil className="size-3.5" />
      </Link>
      <Link to={`/${base[type]}/$slug` as "/movies/$slug"} params={{ slug: i.slug }} className={icon} title="Preview title" aria-label={`Preview ${i.title}`}>
        <Eye className="size-3.5" />
      </Link>
      <button className={icon} title={i.status === "Published" ? "Unpublish" : "Publish"} aria-label={i.status === "Published" ? `Unpublish ${i.title}` : `Publish ${i.title}`} onClick={() => setStatusOf(i, i.status === "Published" ? "Unpublished" : "Published")}>
        {i.status === "Published" ? <EyeOff className="size-3.5" /> : <Check className="size-3.5" />}
      </button>
      <button className={icon} title="Archive" aria-label={`Archive ${i.title}`} disabled={i.status === "Archived"} onClick={() => setStatusOf(i, "Archived")}>
        <Archive className={cn("size-3.5", i.status === "Archived" && "opacity-30")} />
      </button>
      <button className={cn(icon, "hover:bg-primary/10 hover:text-primary-text")} title="Delete" aria-label={`Delete ${i.title}`} onClick={() => setDel(i)}>
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );

  return (
    <>
      <PageHeader
        title={plural[type]}
        sub={`${items.length} ${items.length === 1 ? "title" : "titles"} · ${published} published · manage ${type === "Movie" ? "films" : type === "eBook" ? "books" : "audio titles"} in the StreamVerse catalog.`}
        actions={
          <Link to={`/admin/${base[type]}/new` as "/admin/movies/new"} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-red hover:bg-primary-hover [&_svg]:size-4">
            <Plus /> Add new {noun[type]}
          </Link>
        }
      />
      {drafts.length > 0 && (
        <div className="mb-6 rounded-xl border border-info/30 bg-info/5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <FilePen className="size-4 text-info" /> {drafts.length} unfinished {drafts.length === 1 ? "draft" : "drafts"}
          </div>
          <ul className="mt-2 divide-y divide-border">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{d.title || `Untitled ${noun[type]}`}</span>
                <span className="text-xs text-muted-foreground">Created {new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <Link to={`/admin/${base[type]}/new` as "/admin/movies/new"} search={{ draft: d.id } as never} className="text-xs font-semibold text-primary-text hover:underline">
                  Continue
                </Link>
                <button type="button" aria-label={`Delete draft ${d.title || "untitled"}`} className="grid size-7 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text" onClick={() => { deleteDraft(d.id); toast.success("Draft deleted"); }}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <SearchBox value={q} onChange={setQ} placeholder={cfg.placeholder} />
          <Btn size="sm" variant={filtersOpen ? "outline" : "ghost"} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
            <Filter /> Filters{active ? ` (${active})` : ""}
          </Btn>
          {active > 0 && (
            <Btn size="sm" variant="ghost" onClick={clear}>
              <X /> Clear filters
            </Btn>
          )}
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {list.length} of {items.length} {items.length === 1 ? "title" : "titles"}
          </span>
        </div>
        {filtersOpen && (
          <div className="grid grid-cols-2 gap-3 border-b border-border bg-surface-2/50 px-5 py-3 sm:grid-cols-4">
            {cfg.filters.map((f) => (
              <label key={f.id} className="block min-w-0">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{f.label}</span>
                <select
                  aria-label={f.label}
                  value={chosen[f.id] ?? ""}
                  onChange={(e) => setChosen((c) => ({ ...c, [f.id]: e.target.value }))}
                  className="h-9 w-full min-w-0 rounded-md border border-input bg-surface-2 px-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">All</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        {list.length === 0 ? (
          <div className="p-5">
            <EmptyState title={`No ${plural[type].toLowerCase()} match`} sub="Adjust your search or filters." action={<Btn onClick={clear}>Reset filters</Btn>} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {cfg.cols.map((c) => (
                      <th key={c.key} className={th} aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                        <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 uppercase hover:text-foreground" aria-label={`Sort by ${c.label}`}>
                          {c.label}
                          {sort?.key === c.key ? sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                        </button>
                      </th>
                    ))}
                    <th className={`${th} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.slug} className={tr}>
                      {cfg.cols.map((c) => (
                        <td key={c.key} className={td}>
                          {c.cell(i)}
                        </td>
                      ))}
                      <td className={`${td} text-right`}>{actions(i)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
              <span>
                Showing <b className="text-foreground">1-{list.length}</b> of <b className="text-foreground">{list.length}</b> results
              </span>
              <div className="flex gap-1">
                <button disabled className="h-7 rounded border border-border px-2.5 opacity-50">Previous</button>
                <button className="h-7 rounded border border-primary bg-primary/15 px-2.5 text-foreground">1</button>
                <button disabled className="h-7 rounded border border-border px-2.5 opacity-50">Next</button>
              </div>
            </div>
          </>
        )}
      </Panel>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete this title?"
        description={`"${del?.title}" will be removed from the catalog for all customers. This can't be undone.`}
        onConfirm={() => {
          setItems(type, (o) => o.filter((x) => x.slug !== del?.slug));
          toast.success(`${del?.title} deleted`);
        }}
      />
    </>
  );
}

/* ================================================================ add / edit */

const formSkeleton = (
  <div aria-busy="true" className="space-y-4">
    <Skel className="h-8 w-64" />
    <Skel className="h-16 w-full" />
    <Skel className="h-96 w-full" />
  </div>
);

function DraftChooser({ type, drafts }: { type: ContentType; drafts: DraftRec[] }) {
  const navigate = useNavigate();
  const go = (id: string) => navigate({ to: `/admin/${base[type]}/new` as "/admin/movies/new", search: { draft: id } as never });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Add new ${noun[type]}`} sub="You have unfinished drafts." />
      <Panel>
        <ul className="divide-y divide-border">
          {drafts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{d.title || `Untitled ${noun[type]}`}</div>
                <div className="text-xs text-muted-foreground">
                  Created {new Date(d.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })} · last edited {new Date(d.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
              <Btn variant="primary" size="sm" onClick={() => go(d.id)}>
                Continue Draft
              </Btn>
              <Btn
                size="sm"
                variant="ghost"
                aria-label={`Delete draft ${d.title || "untitled"}`}
                onClick={() => {
                  deleteDraft(d.id);
                  toast.success("Draft deleted");
                }}
              >
                <Trash2 />
              </Btn>
            </li>
          ))}
        </ul>
        <div className="border-t border-border p-4">
          <Btn onClick={() => go(newDraftId())}>
            <Plus /> Start New
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

/** Add and edit both use the multi-step publishing wizard for the content type. */
export function AdminContentForm({ type, slug, draft }: { type: ContentType; slug?: string; draft?: string | undefined }) {
  const items = useStoreItems(type);
  const drafts = useDrafts();
  const draftsReady = useDraftsHydrated();
  const navigate = useNavigate();
  const [fresh] = useState(newDraftId);
  const [nonce, setNonce] = useState(0);
  const existing = slug ? items.find((i) => i.slug === slug) : undefined;

  if (!draftsReady) return formSkeleton;
  if (slug && !existing) {
    return (
      <EmptyState
        title={`${type} not found`}
        sub="It may have been deleted."
        action={<Btn onClick={() => navigate({ to: `/admin/${base[type]}` as "/admin/movies" })}>Back to {plural[type]}</Btn>}
      />
    );
  }

  const editing = existing ? editDraftId(type, existing.slug) : undefined;
  const mine = drafts.filter((d) => d.type === type && !isEditDraft(d));
  if (!existing && !draft && mine.length > 0 && !mine.some((d) => d.id === fresh)) return <DraftChooser type={type} drafts={mine} />;

  const id = editing ?? draft ?? fresh;
  const rec = drafts.find((d) => d.id === id);
  const wizardKey = `${id}-${nonce}`;
  const common = {
    draftId: id,
    ...(rec ? { snapshot: rec.snapshot as never } : {}),
    ...(existing && rec
      ? {
          restored: {
            at: rec.updatedAt,
            onDiscard: () => {
              deleteDraft(id);
              setNonce((n) => n + 1);
            },
          },
        }
      : {}),
  };
  if (type === "Movie") return <MovieWizard key={wizardKey} {...common} {...(existing ? { existing: existing as Movie } : {})} />;
  if (type === "eBook") return <EbookWizard key={wizardKey} {...common} {...(existing ? { existing: existing as Book } : {})} />;
  return <AudiobookWizard key={wizardKey} {...common} {...(existing ? { existing: existing as Book } : {})} />;
}
