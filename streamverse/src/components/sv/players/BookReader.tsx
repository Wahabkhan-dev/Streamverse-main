import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, ListTree, Maximize, Minimize, Minus, Plus, Search, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { meApi } from "@/api/me.api";
import type { Book } from "@/lib/data";
import { DEMO_MODE } from "@/lib/config";
import { useSaveProgressMutation } from "@/hooks/useApiMe";
import { chaptersOf, pageContent, searchBook, totalPagesOf } from "@/lib/book-content";
import { getUser, refKey, saveProgress, toggleBookmark, updateUser, useUser } from "@/lib/user";
import { cn } from "@/lib/utils";
import { useFullscreen, useKey } from "./common";

type Theme = "dark" | "sepia" | "light";
const THEMES: Record<Theme, { page: string; bar: string; panel: string; muted: string }> = {
  dark: { page: "bg-[#0b0d0f] text-[#d7d7d7]", bar: "bg-[#111315] border-white/10", panel: "bg-[#14171b] border-white/10", muted: "text-[#8f969f]" },
  sepia: { page: "bg-[#f4ecd8] text-[#5b4636]", bar: "bg-[#eadfc3] border-black/10", panel: "bg-[#efe5cc] border-black/10", muted: "text-[#8a735c]" },
  light: { page: "bg-white text-[#1a1a1a]", bar: "bg-[#f3f3f3] border-black/10", panel: "bg-[#fafafa] border-black/10", muted: "text-[#6b6b6b]" },
};
const FONT_MIN = 14;
const FONT_MAX = 28;

function RBtn({ label, children, active, className, ...p }: { label: string; children: ReactNode; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active} {...p} className={cn("grid h-9 min-w-9 shrink-0 place-items-center rounded-md px-2 text-current transition-colors hover:bg-current/10 focus-visible:bg-current/10 disabled:opacity-40 [&_svg]:size-[18px]", active && "bg-current/10", className)}>
      {children}
    </button>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const term = q.trim();
  if (term.length < 2) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p.toLowerCase() === term.toLowerCase() ? <mark className="rounded bg-primary/40 px-0.5 text-current">{p}</mark> : p}</Fragment>
      ))}
    </>
  );
}

export function BookReader({ b }: { b: Book }) {
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { isFs, toggle: toggleFs } = useFullscreen(box);
  const chapters = useMemo(() => chaptersOf(b), [b]);
  const total = totalPagesOf(b);
  const prefs = useUser((s) => s.prefs);
  const bookmarks = useUser((s) => s.bookmarks[b.slug]) ?? [];

  const [page, setPage] = useState(() => {
    const p = getUser().progress[refKey({ type: "eBook", slug: b.slug })];
    return p && !p.completed ? Math.max(1, Math.min(total, p.page ?? 1)) : 1;
  });
  const [theme, setTheme] = useState<Theme>(prefs.readerTheme);
  const [font, setFont] = useState(prefs.readerFont);
  const [panel, setPanel] = useState<null | "toc" | "bookmarks" | "search">(null);
  const [query, setQuery] = useState("");
  const pageRef = useRef(page);
  pageRef.current = page;
  const totalRef = useRef(total);
  totalRef.current = total;
  const T = THEMES[theme];
  const apiSave = useSaveProgressMutation();

  const persist = useCallback(() => {
    saveProgress({ type: "eBook", slug: b.slug }, { page: pageRef.current, pct: (pageRef.current / total) * 100 });
  }, [b.slug, total]);

  // Throttle API writes: track when we last wrote so we only write once per 30s during rapid page changes
  const lastApiWriteRef = useRef(0);
  const persistApi = useCallback(() => {
    if (DEMO_MODE) return;
    const now = Date.now();
    if (now - lastApiWriteRef.current < 30000) return;
    lastApiWriteRef.current = now;
    const p = pageRef.current;
    const t = totalRef.current;
    apiSave.mutate(
      { type: "ebooks", contentId: b.slug, data: { percentage: (p / t) * 100, positionPage: p, completed: p >= t } },
      { onError: () => undefined },
    );
  }, [apiSave, b.slug]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      persist();
      if (!DEMO_MODE) {
        // Reset throttle on explicit page turn so unmount/close captures the change
        lastApiWriteRef.current = 0;
        persistApi();
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [page, persist, persistApi]);
  useEffect(() => () => {
    persist();
    if (!DEMO_MODE) {
      const p = pageRef.current;
      const t = totalRef.current;
      void meApi.saveProgress("ebooks", b.slug, { percentage: (p / t) * 100, positionPage: p, completed: p >= t }).catch(() => undefined);
    }
  }, [persist, b.slug]);
  useEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 });
  }, [page]);

  const setThemeSaved = (t: Theme) => {
    setTheme(t);
    updateUser((s) => ({ ...s, prefs: { ...s.prefs, readerTheme: t } }));
  };
  const setFontSaved = (n: number) => {
    const v = Math.max(FONT_MIN, Math.min(FONT_MAX, n));
    setFont(v);
    updateUser((s) => ({ ...s, prefs: { ...s.prefs, readerFont: v } }));
  };
  const go = (n: number) => setPage(Math.max(1, Math.min(total, n)));
  const content = pageContent(b, page, chapters);
  const marked = bookmarks.includes(page);
  const results = useMemo(() => (panel === "search" ? searchBook(b, query, chapters) : []), [panel, b, query, chapters]);

  useKey((e) => {
    if (e.key === "ArrowRight" || e.key === "PageDown") go(pageRef.current + 1);
    else if (e.key === "ArrowLeft" || e.key === "PageUp") go(pageRef.current - 1);
    else if (e.key === "Escape") setPanel(null);
    else if (e.key.toLowerCase() === "f") toggleFs();
  });

  return (
    <main ref={box} className={cn("flex h-screen w-full flex-col overflow-hidden", T.page)}>
      <header className={cn("flex items-center gap-1 overflow-x-auto border-b px-2 py-2 md:px-4", T.bar)}>
        <RBtn label="Close reader" onClick={() => { persist(); navigate({ to: "/ebooks/$slug", params: { slug: b.slug } }); }}>
          <ArrowLeft />
        </RBtn>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-sm font-bold">{b.title}</h1>
          <p className={cn("truncate text-[11px]", T.muted)}>{content.heading ?? chapters[content.chapter]!.title}</p>
        </div>
        <RBtn label="Table of contents" active={panel === "toc"} onClick={() => setPanel(panel === "toc" ? null : "toc")}>
          <ListTree />
        </RBtn>
        <RBtn label="Search in book" active={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}>
          <Search />
        </RBtn>
        <RBtn label={marked ? "Remove bookmark" : "Bookmark this page"} active={marked} onClick={() => toggleBookmark(b.slug, page)}>
          {marked ? <BookmarkCheck /> : <Bookmark />}
        </RBtn>
        <RBtn label={`Bookmarks ${bookmarks.length}`} active={panel === "bookmarks"} onClick={() => setPanel(panel === "bookmarks" ? null : "bookmarks")} className="hidden sm:grid">
          <span className="text-xs font-bold">{bookmarks.length}</span>
        </RBtn>
        <span className="mx-1 hidden h-5 w-px bg-current opacity-20 sm:block" />
        <RBtn label="Decrease font size" onClick={() => setFontSaved(font - 2)} disabled={font <= FONT_MIN}>
          <Minus />
        </RBtn>
        <span className="hidden w-9 text-center text-xs tabular-nums sm:block" aria-label={`Font size ${font}`}>{font}px</span>
        <RBtn label="Increase font size" onClick={() => setFontSaved(font + 2)} disabled={font >= FONT_MAX}>
          <Plus />
        </RBtn>
        <div role="radiogroup" aria-label="Reader theme" className="ml-1 flex shrink-0 gap-1">
          {(["dark", "sepia", "light"] as Theme[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} aria-label={`${t[0]!.toUpperCase()}${t.slice(1)} theme`} title={`${t[0]!.toUpperCase()}${t.slice(1)} theme`} onClick={() => setThemeSaved(t)} className={cn("size-6 rounded-full border-2", t === "dark" ? "bg-[#0b0d0f]" : t === "sepia" ? "bg-[#f4ecd8]" : "bg-white", theme === t ? "border-primary" : "border-current/30")} />
          ))}
        </div>
        <RBtn label={isFs ? "Exit fullscreen" : "Fullscreen reader"} onClick={toggleFs}>
          {isFs ? <Minimize /> : <Maximize />}
        </RBtn>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div ref={scroller} tabIndex={0} role="region" aria-label="Page text" className="min-w-0 flex-1 overflow-auto px-5 py-10 md:px-10">
          <article className="mx-auto max-w-2xl font-serif" style={{ fontSize: font, lineHeight: 1.75 }} aria-label={`Page ${page} of ${total}`}>
            {content.heading && <h2 className="mb-8 text-[1.6em] leading-tight font-bold">{content.heading}</h2>}
            {content.paragraphs.map((p, i) => (
              <p key={i} className="mb-[1em] indent-[1.5em] first:indent-0">
                <Highlight text={p} q={panel === "search" ? query : ""} />
              </p>
            ))}
            <p className={cn("mt-10 text-center text-xs", T.muted)}>{page}</p>
          </article>
        </div>

        {panel && (
          <aside aria-label={panel === "toc" ? "Table of contents" : panel === "search" ? "Search in book" : "Bookmarks"} className={cn("absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l shadow-card", T.panel)}>
            <div className="flex items-center justify-between border-b border-current/10 px-4 py-3">
              <h2 className="text-sm font-bold">{panel === "toc" ? "Contents" : panel === "search" ? "Search in book" : "Bookmarks"}</h2>
              <RBtn label="Close panel" onClick={() => setPanel(null)}>
                <X />
              </RBtn>
            </div>
            {panel === "search" && (
              <div className="border-b border-current/10 p-3">
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words or phrases" aria-label="Search in book" className="h-9 w-full rounded-md border border-current/20 bg-transparent px-3 text-sm outline-none focus:border-primary" />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {panel === "toc" &&
                chapters.map((c, i) => (
                  <button key={c.title} type="button" onClick={() => { go(c.startPage); setPanel(null); }} aria-current={i === content.chapter} className={cn("flex w-full items-center justify-between gap-3 border-b border-current/10 px-4 py-3 text-left text-sm hover:bg-current/5", i === content.chapter && "font-bold")}>
                    <span className="truncate">{c.title}</span>
                    <span className={cn("shrink-0 text-xs", T.muted)}>p. {c.startPage}</span>
                  </button>
                ))}
              {panel === "bookmarks" &&
                (bookmarks.length === 0 ? (
                  <p className={cn("p-6 text-center text-sm", T.muted)}>No bookmarks yet. Use the bookmark button to save a page.</p>
                ) : (
                  bookmarks.map((n) => (
                    <div key={n} className="flex items-center border-b border-current/10">
                      <button type="button" onClick={() => { go(n); setPanel(null); }} className="min-w-0 flex-1 px-4 py-3 text-left text-sm hover:bg-current/5">
                        <span className="font-semibold">Page {n}</span>
                        <span className={cn("block truncate text-xs", T.muted)}>{pageContent(b, n, chapters).paragraphs[0]}</span>
                      </button>
                      <RBtn label={`Remove bookmark on page ${n}`} onClick={() => toggleBookmark(b.slug, n)}>
                        <X />
                      </RBtn>
                    </div>
                  ))
                ))}
              {panel === "search" &&
                (query.trim().length < 2 ? (
                  <p className={cn("p-6 text-center text-sm", T.muted)}>Type at least two letters.</p>
                ) : results.length === 0 ? (
                  <p className={cn("p-6 text-center text-sm", T.muted)}>No matches for “{query}”.</p>
                ) : (
                  results.map((r) => (
                    <button key={r.page} type="button" onClick={() => go(r.page)} className="block w-full border-b border-current/10 px-4 py-3 text-left text-sm hover:bg-current/5">
                      <span className="font-semibold">Page {r.page}</span>
                      <span className={cn("block text-xs", T.muted)}>
                        <Highlight text={r.snippet} q={query} />
                      </span>
                    </button>
                  ))
                ))}
            </div>
          </aside>
        )}
      </div>

      <footer className={cn("flex items-center gap-2 border-t px-2 py-2 md:gap-4 md:px-4", T.bar)}>
        <RBtn label="Previous page" onClick={() => go(page - 1)} disabled={page <= 1}>
          <ChevronLeft />
        </RBtn>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input type="range" min={1} max={total} value={page} onChange={(e) => go(Number(e.target.value))} aria-label="Go to page" aria-valuetext={`Page ${page} of ${total}`} className="h-1.5 w-full cursor-pointer accent-[var(--primary)]" />
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums">
          <label className="inline-flex items-center gap-1">
            Page
            <input type="number" min={1} max={total} value={page} onChange={(e) => e.target.value && go(Number(e.target.value))} aria-label="Current page" className="h-7 w-14 rounded border border-current/20 bg-transparent px-1 text-center outline-none focus:border-primary" />
            <span className={T.muted}>/ {total}</span>
          </label>
          <div className={T.muted}>{Math.round((page / total) * 100)}% read</div>
        </div>
        <RBtn label="Next page" onClick={() => go(page + 1)} disabled={page >= total}>
          <ChevronRight />
        </RBtn>
      </footer>
    </main>
  );
}
