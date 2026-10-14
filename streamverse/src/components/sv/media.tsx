import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Info, Play, Headphones, BookOpen, Film } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Book, Movie } from "@/lib/data";
import type { Collection } from "@/lib/store";
import type { LinkTarget } from "@/lib/links";
import { Skel, Tag } from "./ui";

/* ---------- Hero ---------- */
export interface HeroSlide {
  key: string;
  image: string;
  mobileImage?: string;
  title: string;
  description: string;
  buttonText: string;
  eyebrow?: string;
  movie?: Movie;
  target?: LinkTarget;
  infoTarget?: LinkTarget;
}

export function HeroBanner({ slides, autoplay = true }: { slides: HeroSlide[]; autoplay?: boolean }) {
  const [i, setI] = useState(0);
  const count = slides.length;
  useEffect(() => {
    if (count < 2 || !autoplay) return;
    const t = setInterval(() => setI((v) => (v + 1) % count), 8000);
    return () => clearInterval(t);
  }, [count, autoplay]);
  const s = slides[Math.min(i, count - 1)];
  if (!s) return null;
  return (
    <section className="relative h-[72vh] min-h-[460px] w-full overflow-hidden bg-ink md:h-[78vh] md:min-h-[520px]" aria-roledescription="carousel" aria-label="Featured">
      {slides.map((it, idx) => (
        <picture key={it.key} className={cn("absolute inset-0 transition-opacity duration-1000", idx === i ? "opacity-100" : "opacity-0")}>
          {it.mobileImage && <source media="(max-width: 767px)" srcSet={it.mobileImage} />}
          <img src={it.image} alt="" className="size-full object-cover" />
        </picture>
      ))}
      <div className="absolute inset-0 bg-hero-x" />
      <div className="absolute inset-0 bg-hero-y" />
      <div className="relative mx-auto flex h-full max-w-[1600px] items-end px-4 pb-10 md:items-center md:px-8 md:pb-0">
        <div key={s.key} className="max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <span className="eyebrow text-primary-text">{s.eyebrow ?? "StreamVerse Original"}</span>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">{s.title}</h1>
          {s.movie && <MovieMeta m={s.movie} className="mt-4" />}
          <p className="mt-4 line-clamp-3 text-sm text-soft md:text-base">{s.description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {s.target && (
              <Link to={s.target.to as "/"} {...(s.target.params ? { params: s.target.params as never } : {})} className={btnLg("primary")}>
                <Play className="fill-current" /> {s.buttonText}
              </Link>
            )}
            {s.infoTarget && (
              <Link to={s.infoTarget.to as "/"} {...(s.infoTarget.params ? { params: s.infoTarget.params as never } : {})} className={btnLg("glass")}>
                <Info /> More Info
              </Link>
            )}
          </div>
          {/* Dots sit below the buttons, inside the content flow — never overlapping the row below */}
          {count > 1 && (
            <div className="mt-5 flex gap-2">
              {slides.map((it, idx) => (
                <button
                  key={it.key}
                  aria-label={`Show ${it.title}`}
                  aria-current={idx === i}
                  onClick={() => setI(idx)}
                  className={cn("h-1.5 rounded-full transition-all", idx === i ? "w-8 bg-primary" : "w-4 bg-foreground/40 hover:bg-foreground/70")}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
const btnLg = (v: "primary" | "glass") =>
  cn(
    "inline-flex h-12 items-center gap-2 rounded-md px-6 text-sm font-bold tracking-wide uppercase transition-all [&_svg]:size-4",
    v === "primary" ? "bg-primary text-primary-foreground hover:bg-primary-hover shadow-red" : "border border-border bg-foreground/15 backdrop-blur hover:bg-foreground/25",
  );

export function MovieMeta({ m, className }: { m: Movie; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm text-soft", className)}>
      <span className="font-semibold text-success">98% Match</span>
      <span>{m.year}</span>
      <Tag tone="outline">{m.rating}</Tag>
      <span>{m.runtime}</span>
      <span className="text-muted-foreground">•</span>
      <span>{m.genres.join(" · ")}</span>
      {m.badges.map((b) => (
        <Tag key={b}>{b}</Tag>
      ))}
    </div>
  );
}

/* ---------- Row ---------- */
export type SeeAllPath = "/movies" | "/ebooks" | "/audiobooks" | "/my-library" | "/collections" | "/my-list" | "/history";

export function RowSkeleton({ title, variant = "wide" }: { title?: string; variant?: "wide" | "book" | "square" }) {
  return (
    <section aria-busy="true" aria-label={title ? `Loading ${title}` : "Loading"}>
      {title && (
        <div className="mb-3 px-4 md:px-8">
          <Skel className="h-6 w-44" />
        </div>
      )}
      <div className="no-scrollbar flex gap-3 overflow-hidden px-4 md:px-8">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={cn("shrink-0", variant === "wide" ? "w-64 md:w-72" : "w-36 md:w-40")}>
            <Skel className={cn(variant === "wide" ? "aspect-video" : variant === "square" ? "aspect-square" : "aspect-[2/3]")} />
            <Skel className="mt-2 h-4 w-2/3" />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * A horizontally scrolling row. While `loading` it shows a skeleton. With `empty` it renders nothing,
 * so a heading is never left sitting above a blank space.
 */
export function MediaRow({ title, children, seeAll, loading, empty, variant }: { title: string; children?: ReactNode; seeAll?: SeeAllPath; loading?: boolean; empty?: boolean; variant?: "wide" | "book" | "square" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: "smooth" });
  // an arrow only exists while there is something to scroll to in that direction
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    ro?.observe(el);
    for (const c of Array.from(el.children)) ro?.observe(c);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [loading, empty, children]);
  if (loading) return <RowSkeleton title={title} {...(variant ? { variant } : {})} />;
  if (empty) return null;
  return (
    <section className="group/row relative" aria-label={title}>
      <div className="mb-3 flex items-end justify-between px-4 md:px-8">
        <h2 className="text-lg font-bold tracking-tight md:text-xl">{title}</h2>
        {seeAll && (
          <Link to={seeAll} className="text-xs font-semibold text-muted-foreground hover:text-primary-text">
            See All
          </Link>
        )}
      </div>
      <div className="relative">
        <div ref={ref} className="no-scrollbar flex gap-3 overflow-x-auto scroll-smooth px-4 pb-2 md:px-8">
          {children}
        </div>
        {edge.left && (
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label={`Scroll ${title} left`}
            className="absolute inset-y-0 left-0 hidden w-10 place-items-center bg-ink/60 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 md:grid"
          >
            <ChevronLeft />
          </button>
        )}
        {edge.right && (
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={`Scroll ${title} right`}
            className="absolute inset-y-0 right-0 hidden w-10 place-items-center bg-ink/60 opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 md:grid"
          >
            <ChevronRight />
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- Movie card ---------- */
export function MovieCard({ m, wide = true, className }: { m: Movie; wide?: boolean; className?: string }) {
  return (
    <Link to="/movies/$slug" params={{ slug: m.slug }} className={cn("group block shrink-0", wide ? "w-64 md:w-72" : "w-full", className)}>
      <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-surface-2 shadow-card">
        <img src={m.image} alt={m.title} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-card-fade opacity-70" />
        <div className="absolute top-2 left-2 flex gap-1">
          {m.badges.slice(0, 1).map((b) => (
            <Tag key={b} tone={b === "4K" ? "red" : "muted"}>
              {b}
            </Tag>
          ))}
        </div>
        <span className="absolute right-3 bottom-3 grid size-9 scale-90 place-items-center rounded-full bg-primary opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
          <Play className="size-4 fill-current" />
        </span>
      </div>
      <div className="mt-2 truncate text-sm font-semibold">{m.title}</div>
      <div className="text-xs text-muted-foreground">
        {m.year} · {m.runtime} · {m.genres[0]}
      </div>
    </Link>
  );
}

export function ProgressCard({ m, progress, left }: { m: Movie; progress: number; left: string }) {
  return (
    <Link to="/watch/$slug" params={{ slug: m.slug }} className="group relative block w-72 shrink-0">
      <span className="sr-only">Resume </span>
      <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-surface-2">
        <img src={m.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-card-fade" />
        <span className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-foreground/80 bg-ink/50 backdrop-blur transition-colors group-hover:border-primary group-hover:bg-primary">
          <Play className="size-5 fill-current" />
        </span>
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between">
          <span className="truncate text-sm font-semibold">{m.title}</span>
          <span className="text-[11px] text-soft">{left}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-foreground/20">
          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Link>
  );
}

/* ---------- Book cover (typographic, generated) ---------- */
export function BookCover({ b, square = false, className }: { b: Book; square?: boolean; className?: string }) {
  const [from, to, accent] = b.palette;
  if (b.cover) {
    return (
      <div className={cn("relative overflow-hidden rounded-md border border-border shadow-card", square ? "aspect-square" : "aspect-[2/3]", className)}>
        <img src={b.cover} alt={b.title} className="absolute inset-0 size-full object-cover" />
      </div>
    );
  }
  const motif = {
    sun: <circle cx="50" cy="42" r="18" fill={accent} opacity="0.9" />,
    circle: (
      <g fill="none" stroke={accent} strokeWidth="0.8" opacity="0.8">
        <circle cx="50" cy="45" r="10" />
        <circle cx="50" cy="45" r="18" />
        <circle cx="50" cy="45" r="26" />
      </g>
    ),
    line: (
      <g stroke={accent} strokeWidth="0.8" opacity="0.8">
        {[20, 28, 36, 44, 52, 60].map((y) => (
          <line key={y} x1="15" x2="85" y1={y} y2={y} />
        ))}
      </g>
    ),
    grid: (
      <g fill={accent} opacity="0.85">
        {[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={22 + c * 15} y={20 + r * 12} width="9" height="6" />))}
      </g>
    ),
    wave: <path d="M5 50 Q 20 35 35 50 T 65 50 T 95 50" fill="none" stroke={accent} strokeWidth="2" opacity="0.9" />,
    triangle: <polygon points="50,18 78,68 22,68" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.9" />,
  }[b.motif];
  return (
    <div
      className={cn("relative overflow-hidden rounded-md border border-border shadow-card", square ? "aspect-square" : "aspect-[2/3]", className)}
      style={{ background: `linear-gradient(160deg, ${from}, ${to})`, color: accent }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        {motif}
      </svg>
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="text-[13px] leading-tight font-black tracking-tight uppercase md:text-sm">{b.title}</div>
        <div className="mt-1 text-[9px] font-semibold tracking-widest uppercase opacity-80">{b.author}</div>
      </div>
      <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-r from-ink/40 to-transparent" />
    </div>
  );
}

export function BookCard({ b, fixed = true }: { b: Book; fixed?: boolean }) {
  return (
    <Link to="/ebooks/$slug" params={{ slug: b.slug }} className={cn("group block", fixed && "w-36 shrink-0 md:w-40")}>
      <BookCover b={b} className="transition-transform duration-300 group-hover:-translate-y-1" />
      <div className="mt-2 truncate text-sm font-semibold">{b.title}</div>
      <div className="truncate text-xs text-muted-foreground">{b.author}</div>
    </Link>
  );
}

export function AudiobookCard({ b, fixed = true }: { b: Book; fixed?: boolean }) {
  return (
    <Link to="/audiobooks/$slug" params={{ slug: b.slug }} className={cn("group block", fixed && "w-40 shrink-0 md:w-44")}>
      <div className="relative">
        <BookCover b={b} square />
        <span className="absolute right-2 bottom-2 grid size-9 place-items-center rounded-full bg-primary shadow-red transition-transform group-hover:scale-110">
          <Play className="size-4 fill-current" />
        </span>
        <span className="absolute top-2 left-2 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold text-soft">{b.duration}</span>
      </div>
      <div className="mt-2 truncate text-sm font-semibold">{b.title}</div>
      <div className="truncate text-xs text-muted-foreground">Narrated by {b.narrator}</div>
    </Link>
  );
}

export function CollectionCard({ c, fixed = true }: { c: Collection; fixed?: boolean }) {
  return (
    <Link to="/collections/$slug" params={{ slug: c.slug }} className={cn("group relative block aspect-[16/10] overflow-hidden rounded-lg border border-border", fixed ? "w-60 shrink-0" : "w-full")}>
      <img src={c.cover} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 border-l-2 border-primary p-3">
        <div className="font-bold">{c.name}</div>
        <div className="text-xs text-soft">{c.items.length} titles</div>
      </div>
    </Link>
  );
}

/** Simple async simulation so pages can show skeletons on first paint. */
export function useFakeLoad(ms = 500) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}
