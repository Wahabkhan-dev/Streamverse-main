import { Link } from "@tanstack/react-router";
import { BookOpen, Headphones, Play } from "lucide-react";
import type { Item } from "@/lib/items";
import { playTarget } from "@/lib/links";
import { useProgressOf } from "@/lib/user";
import { cn } from "@/lib/utils";
import { AudiobookCard, BookCard, BookCover, MovieCard } from "./media";

/** The right card for any catalog entry. */
export function ItemCard({ item, fixed = true }: { item: Item; fixed?: boolean }) {
  if (item.type === "Movie") return <MovieCard m={item.m} wide={fixed} />;
  if (item.type === "eBook") return <BookCard b={item.b} fixed={fixed} />;
  return <AudiobookCard b={item.b} fixed={fixed} />;
}

const verb = { Movie: ["Resume", "Replay", "Play"], eBook: ["Continue reading", "Read again", "Start reading"], Audiobook: ["Continue listening", "Listen again", "Start listening"] } as const;

/** A card with its progress bar and a Resume link, used by the library and history lists. */
export function ProgressItemCard({ item, className }: { item: Item; className?: string }) {
  const p = useProgressOf(item);
  const t = playTarget(item.type, item.slug);
  const [resume, again, start] = verb[item.type];
  return (
    <div className={cn("w-full min-w-0", className)}>
      <ItemCard item={item} fixed={false} />
      <div className="mt-2">
        <div className="h-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p?.pct ?? 0)} aria-label="Progress">
          <div className="h-full bg-primary" style={{ width: `${p?.pct ?? 0}%` }} />
        </div>
        <div className="mt-1 flex justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{!p ? "Not started" : p.completed ? "Completed" : `${Math.round(p.pct)}% complete`}</span>
          <Link to={t.to as "/"} params={t.params as never} className="inline-flex items-center gap-1 font-semibold text-primary-text hover:underline">
            <Play className="size-3 fill-current" /> {!p ? start : p.completed ? again : resume}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Row card for "Continue Reading" / "Continue Listening". */
export function ContinueBookCard({ item }: { item: Extract<Item, { type: "eBook" | "Audiobook" }> }) {
  const p = useProgressOf(item);
  const t = playTarget(item.type, item.slug);
  const Icon = item.type === "eBook" ? BookOpen : Headphones;
  return (
    <Link to={t.to as "/"} params={t.params as never} className="group relative flex w-72 shrink-0 items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:border-foreground/25">
      <span className="sr-only">{item.type === "eBook" ? "Continue reading" : "Continue listening to"} </span>
      <BookCover b={item.b} square={item.type === "Audiobook"} className="w-16 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{item.b.title}</div>
        <div className="truncate text-xs text-muted-foreground">{item.b.author}</div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full bg-primary" style={{ width: `${p?.pct ?? 0}%` }} />
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-primary-text">
          <Icon className="size-3" /> {item.type === "eBook" ? `Page ${p?.page ?? 1}` : `Chapter ${(p?.chapter ?? 0) + 1}`} · {Math.round(p?.pct ?? 0)}%
        </div>
      </div>
    </Link>
  );
}
