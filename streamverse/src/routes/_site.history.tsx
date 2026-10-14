import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Film, Headphones, History as HistoryIcon, Play, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookCover } from "@/components/sv/media";
import { Btn, EmptyState, Skel, TabBar } from "@/components/sv/ui";
import { itemTitle, useCatalog, toItem, type Item } from "@/lib/items";
import { detailTarget, playTarget } from "@/lib/links";
import { refKey, removeFromHistory, updateUser, useHistory, useProgressMap } from "@/lib/user";
import { DEMO_MODE } from "@/lib/config";
import { useApiHistoryQuery, useDeleteHistoryMutation, useClearHistoryMutation } from "@/hooks/useApiMe";
import type { ApiHistoryEntry, ApiMovie, ApiBook } from "@/api/types";
import type { Movie, Book, Status } from "@/lib/data";

type Tab = "all" | "watched" | "read" | "listened";
const typeOf = { watched: "Movie", read: "eBook", listened: "Audiobook" } as const;
const verbOf = { Movie: "Watched", eBook: "Read", Audiobook: "Listened" } as const;
const IconOf = { Movie: Film, eBook: BookOpen, Audiobook: Headphones } as const;

export const Route = createFileRoute("/_site/history")({
  head: () => ({ meta: [{ title: "History — StreamVerse" }, { name: "description", content: "What you've watched, read and listened to." }] }),
  component: HistoryPage,
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

function apiHistoryEntryToRow(entry: ApiHistoryEntry): { id: string; item: Item; at: number } | null {
  let item: Item | null = null;
  if (entry.contentType === "movie" && entry.movie) item = apiMovieToItem(entry.movie);
  else if (entry.contentType === "ebook" && entry.ebook) item = apiBookToItem(entry.ebook, "eBook");
  else if (entry.contentType === "audiobook" && entry.audiobook) item = apiBookToItem(entry.audiobook, "Audiobook");
  if (!item) return null;
  return { id: entry.id, item, at: new Date(entry.watchedAt).getTime() };
}

function Thumb({ item }: { item: Item }) {
  if (item.type === "Movie") return <img src={item.m.image} alt="" className="h-16 w-28 shrink-0 rounded-md object-cover" />;
  return <BookCover b={item.b} square className="w-16 shrink-0" />;
}

function HistoryPage() {
  const [tab, setTab] = useState<Tab>("all");

  // Demo-mode data (always call hooks)
  const demoHistory = useHistory();
  const progress = useProgressMap();
  const cat = useCatalog();

  // API-mode data
  const apiHistoryQuery = useApiHistoryQuery(1);
  const deleteHistoryMutation = useDeleteHistoryMutation();
  const clearHistoryMutation = useClearHistoryMutation();

  // Build rows
  const rows: Array<{ id: string; item: Item; p: { pct: number; completed?: boolean } | undefined; at: number }> = useMemo(() => {
    if (DEMO_MODE) {
      return demoHistory
        .map((h) => ({ h, item: cat.resolve(h), p: progress[refKey(h)] }))
        .filter((r): r is { h: typeof r.h; item: Item; p: typeof r.p } => !!r.item)
        .map((r) => ({ id: refKey(r.h), item: r.item, p: r.p, at: r.h.at }));
    }
    return (apiHistoryQuery.data?.data ?? [])
      .map(apiHistoryEntryToRow)
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => ({ ...r, p: progress[refKey(r.item)] }));
  }, [DEMO_MODE, demoHistory, cat, progress, apiHistoryQuery.data]);

  // Loading / error states (after all hooks)
  if (!DEMO_MODE && apiHistoryQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 pt-8 md:px-8">
        <Skel className="h-8 w-32" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }, (_, i) => <Skel key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (!DEMO_MODE && apiHistoryQuery.isError) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 pt-8 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <p className="mt-6 text-sm text-muted-foreground">Failed to load history. Please refresh and try again.</p>
      </div>
    );
  }

  const shown = tab === "all" ? rows : rows.filter((r) => r.item.type === typeOf[tab]);
  const count = (t: Item["type"]) => rows.filter((r) => r.item.type === t).length;

  const handleClearHistory = () => {
    if (!DEMO_MODE) {
      clearHistoryMutation.mutate(undefined, {
        onSuccess: () => toast.success("History cleared"),
        onError: () => toast.error("Failed to clear history"),
      });
      return;
    }
    updateUser((s) => ({ ...s, history: [] }));
    toast.success("History cleared");
  };

  const handleRemoveItem = (row: { id: string; item: Item }) => {
    if (!DEMO_MODE) {
      deleteHistoryMutation.mutate(row.id, {
        onSuccess: () => toast.success("Removed from history"),
        onError: () => toast.error("Failed to remove from history"),
      });
      return;
    }
    // Demo mode: find the HistoryEntry and remove it
    const h = demoHistory.find((he) => refKey(he) === refKey(row.item));
    if (h) removeFromHistory(h);
    toast.success("Removed from history");
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything you've watched, read and listened to.</p>
        </div>
        {rows.length > 0 && (
          <Btn
            variant="outline"
            disabled={clearHistoryMutation.isPending}
            onClick={handleClearHistory}
          >
            <Trash2 /> Clear history
          </Btn>
        )}
      </div>
      <div className="mt-6">
        <TabBar
          label="History type"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: "All", count: rows.length },
            { id: "watched", label: "Watched", count: count("Movie") },
            { id: "read", label: "Read", count: count("eBook") },
            { id: "listened", label: "Listened", count: count("Audiobook") },
          ]}
        />
      </div>
      <div className="py-6">
        {shown.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="No history yet" sub="Titles you watch, read or listen to will be listed here." action={<Link to="/" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">Browse StreamVerse</Link>} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {shown.map((row) => {
              const { item, p } = row;
              const Icon = IconOf[item.type];
              const d = detailTarget(item.type, item.slug);
              const play = playTarget(item.type, item.slug);
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-4 p-4">
                  <Thumb item={item} />
                  <div className="min-w-0 flex-1 basis-48">
                    <Link to={d.to as "/"} params={d.params as never} className="block truncate font-semibold hover:underline">
                      {itemTitle(item)}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Icon className="size-3.5 text-primary-text" /> {item.type}
                      </span>
                      <span>
                        {verbOf[item.type]} {new Date(row.at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1 w-40 max-w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(p?.pct ?? 0)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
                        <div className="h-full bg-primary" style={{ width: `${p?.pct ?? 0}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{p?.completed ? "Completed" : `${Math.round(p?.pct ?? 0)}%`}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={play.to as "/"} params={play.params as never} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover [&_svg]:size-4">
                      <Play className="fill-current" /> {p?.completed ? "Again" : "Resume"}
                    </Link>
                    <Btn
                      size="icon"
                      variant="outline"
                      aria-label={`Remove ${itemTitle(item)} from history`}
                      title="Remove from history"
                      onClick={() => handleRemoveItem(row)}
                    >
                      <Trash2 />
                    </Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
