import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, ListTree, Maximize, Minimize, Minus, Plus, Search, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { meApi } from "@/api/me.api";
import type { ApiEbookAccess } from "@/api/types";
import type { Book } from "@/lib/data";
import { DEMO_MODE } from "@/lib/config";
import { useSaveProgressMutation } from "@/hooks/useApiMe";
import { chaptersOf, pageContent, searchBook, totalPagesOf } from "@/lib/book-content";
import { getUser, refKey, saveProgress, toggleBookmark, updateUser, useUser } from "@/lib/user";
import { cn } from "@/lib/utils";
import { useFullscreen, useKey } from "./common";
import { EpubReader, type EpubReaderHandle, type TocItem } from "./EpubReader";
import { PdfReader, type PdfReaderHandle } from "./PdfReader";

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

/** Access data shape passed from read.$slug.tsx when !DEMO_MODE */
export interface BookReaderAccessData {
  signedUrl: string;
  fileType: ApiEbookAccess["fileType"];
  contentId: string;
  initialLocation?: string | null;
  initialPage?: number;
  initialPct?: number;
}

export function BookReader({ b, accessData }: { b: Book; accessData?: BookReaderAccessData }) {
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { isFs, toggle: toggleFs } = useFullscreen(box);

  /** True when we should use the real EPUB/PDF renderer instead of synthetic content */
  const useRealReader = !DEMO_MODE && accessData != null;

  // â”€â”€â”€ Demo mode state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const chapters = useMemo(() => chaptersOf(b), [b]);
  const total = totalPagesOf(b);
  const prefs = useUser((s) => s.prefs);
  const bookmarks = useUser((s) => s.bookmarks[b.slug]) ?? [];

  const [page, setPage] = useState(() => {
    if (useRealReader) return 1; // Not used in real reader mode
    const p = getUser().progress[refKey({ type: "eBook", slug: b.slug })];
    return p && !p.completed ? Math.max(1, Math.min(total, p.page ?? 1)) : 1;
  });
  const pageRef = useRef(page);
  pageRef.current = page;
  const totalRef = useRef(total);
  totalRef.current = total;

  // â”€â”€â”€ Real reader state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [currentPct, setCurrentPct] = useState(accessData?.initialPct ?? 0);
  const [currentLocation, setCurrentLocation] = useState<string | null>(
    accessData?.initialLocation ?? null,
  );
  const [epubToc, setEpubToc] = useState<TocItem[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [apiBookmarks, setApiBookmarks] = useState<string[]>([]);
  const [readerError, setReaderError] = useState<string | null>(null);

  const currentPctRef = useRef(currentPct);
  currentPctRef.current = currentPct;
  const currentLocationRef = useRef(currentLocation);
  currentLocationRef.current = currentLocation;

  const epubRef = useRef<EpubReaderHandle>(null);
  const pdfRef = useRef<PdfReaderHandle>(null);

  // â”€â”€â”€ Shared state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [theme, setTheme] = useState<Theme>(prefs.readerTheme);
  const [font, setFont] = useState(prefs.readerFont);
  const [panel, setPanel] = useState<null | "toc" | "bookmarks" | "search">(null);
  const [query, setQuery] = useState("");
  const T = THEMES[theme];

  // â”€â”€â”€ Demo mode API save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const apiSave = useSaveProgressMutation();
  const lastApiWriteRef = useRef(0);

  const persistDemoLocal = useCallback(() => {
    if (useRealReader) return;
    saveProgress({ type: "eBook", slug: b.slug }, { page: pageRef.current, pct: (pageRef.current / total) * 100 });
  }, [b.slug, total, useRealReader]);

  const persistDemoApi = useCallback(() => {
    if (useRealReader || DEMO_MODE) return;
    const now = Date.now();
    if (now - lastApiWriteRef.current < 30000) return;
    lastApiWriteRef.current = now;
    const p = pageRef.current;
    const t = totalRef.current;
    apiSave.mutate(
      { type: "ebook", contentId: b.slug, data: { percentage: (p / t) * 100, positionPage: p, completed: p >= t } },
      { onError: () => undefined },
    );
  }, [apiSave, b.slug, useRealReader]);

  // Demo mode: save on page change
  useEffect(() => {
    if (useRealReader) return;
    const id = window.setTimeout(() => {
      persistDemoLocal();
      if (!DEMO_MODE) {
        lastApiWriteRef.current = 0;
        persistDemoApi();
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [page, persistDemoLocal, persistDemoApi, useRealReader]);

  // Demo mode: save on unmount
  useEffect(() => {
    if (useRealReader) return undefined;
    return () => {
      persistDemoLocal();
      if (!DEMO_MODE) {
        const p = pageRef.current;
        const t = totalRef.current;
        void meApi.saveProgress("ebook", b.slug, { percentage: (p / t) * 100, positionPage: p, completed: p >= t }).catch(() => undefined);
      }
    };
  }, [persistDemoLocal, b.slug, useRealReader]);

  // Demo mode: scroll to top on page change
  useEffect(() => {
    if (!useRealReader) scroller.current?.scrollTo?.({ top: 0 });
  }, [page, useRealReader]);

  // â”€â”€â”€ Real reader: save on unmount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!useRealReader) return undefined;
    const cid = accessData?.contentId;
    return () => {
      if (!cid) return;
      const pct = currentPctRef.current;
      const loc = currentLocationRef.current;
      const isNumericLoc = loc !== null && /^\d+$/.test(loc);
      const data = isNumericLoc
        ? { percentage: pct, positionPage: Number(loc) }
        : { percentage: pct };
      void meApi.saveProgress("ebook", cid, data).catch(() => undefined);
    };
  }, [useRealReader, accessData?.contentId]);

  // â”€â”€â”€ Real reader: location change handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleLocationChange = useCallback(
    (cfi: string, pct: number) => {
      setCurrentPct(pct);
      setCurrentLocation(cfi);
      const now = Date.now();
      if (now - lastApiWriteRef.current >= 30_000 && accessData?.contentId) {
        lastApiWriteRef.current = now;
        void meApi.saveProgress("ebook", accessData.contentId, { percentage: pct }).catch(() => undefined);
      }
    },
    [accessData?.contentId],
  );

  // â”€â”€â”€ Real reader: PDF page change handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handlePdfPageChange = useCallback(
    (pg: number, total: number) => {
      setTotalPages(total);
      const pct = total > 0 ? Math.round((pg / total) * 100) : 0;
      setCurrentPct(pct);
      setCurrentLocation(String(pg));
      const now = Date.now();
      if (now - lastApiWriteRef.current >= 30_000 && accessData?.contentId) {
        lastApiWriteRef.current = now;
        void meApi.saveProgress("ebook", accessData.contentId, { percentage: pct, positionPage: pg }).catch(() => undefined);
      }
    },
    [accessData?.contentId],
  );

  // â”€â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const setThemeSaved = (t: Theme) => {
    setTheme(t);
    updateUser((s) => ({ ...s, prefs: { ...s.prefs, readerTheme: t } }));
  };
  const setFontSaved = (n: number) => {
    const v = Math.max(FONT_MIN, Math.min(FONT_MAX, n));
    setFont(v);
    updateUser((s) => ({ ...s, prefs: { ...s.prefs, readerFont: v } }));
  };

  // Demo mode page navigation
  const go = (n: number) => setPage(Math.max(1, Math.min(total, n)));

  // Real reader navigation
  const readerNext = useCallback(() => {
    if (accessData?.fileType === "epub") epubRef.current?.next();
    else pdfRef.current?.next();
  }, [accessData?.fileType]);

  const readerPrev = useCallback(() => {
    if (accessData?.fileType === "epub") epubRef.current?.prev();
    else pdfRef.current?.prev();
  }, [accessData?.fileType]);

  // Demo mode content
  const content = useRealReader
    ? { heading: null as string | null, paragraphs: [] as string[], chapter: 0 }
    : pageContent(b, page, chapters);

  const marked = useRealReader
    ? apiBookmarks.includes(currentLocation ?? "")
    : bookmarks.includes(page);

  const results = useMemo(
    () => (panel === "search" && !useRealReader ? searchBook(b, query, chapters) : []),
    [panel, b, query, chapters, useRealReader],
  );

  // â”€â”€â”€ Keyboard navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useKey((e) => {
    if (useRealReader) {
      if (e.key === "ArrowRight" || e.key === "PageDown") readerNext();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") readerPrev();
      else if (e.key === "Escape") setPanel(null);
      else if (e.key.toLowerCase() === "f") toggleFs();
    } else {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(pageRef.current + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(pageRef.current - 1);
      else if (e.key === "Escape") setPanel(null);
      else if (e.key.toLowerCase() === "f") toggleFs();
    }
  });

  // â”€â”€â”€ Bookmark helpers for real reader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const toggleApiBookmark = () => {
    const loc = currentLocation;
    if (!loc) return;
    setApiBookmarks((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc],
    );
  };

  // â”€â”€â”€ Current chapter label (header subtitle) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const subLabel = useRealReader
    ? (currentPct > 0 ? `${currentPct}% read` : "")
    : (content.heading ?? chapters[content.chapter]?.title ?? "");

  // â”€â”€â”€ PDF current page (derived from currentLocation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const pdfCurrentPage = accessData?.fileType === "pdf" && currentLocation !== null
    ? (Number(currentLocation) || 1)
    : 1;

  return (
    <main ref={box} className={cn("flex h-screen w-full flex-col overflow-hidden", T.page)}>
      {/* â”€â”€ Top toolbar â”€â”€ */}
      <header className={cn("flex items-center gap-1 overflow-x-auto border-b px-2 py-2 md:px-4", T.bar)}>
        <RBtn
          label="Close reader"
          onClick={() => {
            if (!useRealReader) persistDemoLocal();
            navigate({ to: "/ebooks/$slug", params: { slug: b.slug } });
          }}
        >
          <ArrowLeft />
        </RBtn>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-sm font-bold">{b.title}</h1>
          {subLabel && <p className={cn("truncate text-[11px]", T.muted)}>{subLabel}</p>}
        </div>
        <RBtn label="Table of contents" active={panel === "toc"} onClick={() => setPanel(panel === "toc" ? null : "toc")}>
          <ListTree />
        </RBtn>
        {!useRealReader && (
          <RBtn label="Search in book" active={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}>
            <Search />
          </RBtn>
        )}
        <RBtn
          label={marked ? "Remove bookmark" : "Bookmark this page"}
          active={marked}
          onClick={() => {
            if (useRealReader) toggleApiBookmark();
            else toggleBookmark(b.slug, page);
          }}
        >
          {marked ? <BookmarkCheck /> : <Bookmark />}
        </RBtn>
        <RBtn
          label={useRealReader ? `Bookmarks ${apiBookmarks.length}` : `Bookmarks ${bookmarks.length}`}
          active={panel === "bookmarks"}
          onClick={() => setPanel(panel === "bookmarks" ? null : "bookmarks")}
          className="hidden sm:grid"
        >
          <span className="text-xs font-bold">{useRealReader ? apiBookmarks.length : bookmarks.length}</span>
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

      {/* â”€â”€ Main content area â”€â”€ */}
      <div className="relative flex min-h-0 flex-1">
        {useRealReader ? (
          /* Real reader (EPUB or PDF) */
          <div className="min-w-0 flex-1 overflow-hidden">
            {readerError ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="max-w-sm text-center">
                  <p className={cn("text-sm font-medium", T.muted)}>{readerError}</p>
                </div>
              </div>
            ) : accessData?.fileType === "epub" ? (
              <EpubReader
                ref={epubRef}
                url={accessData.signedUrl}
                initialLocation={accessData.initialLocation ?? null}
                onLocationChange={handleLocationChange}
                onReady={setEpubToc}
                onError={setReaderError}
                theme={theme}
                fontSize={font}
              />
            ) : (
              <PdfReader
                ref={pdfRef}
                url={accessData?.signedUrl ?? ""}
                initialPage={accessData?.initialPage ?? 1}
                onPageChange={handlePdfPageChange}
                onReady={setTotalPages}
                onError={setReaderError}
              />
            )}
          </div>
        ) : (
          /* Demo / synthetic content */
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
        )}

        {/* â”€â”€ Side panels â”€â”€ */}
        {panel && (
          <aside
            aria-label={panel === "toc" ? "Table of contents" : panel === "search" ? "Search in book" : "Bookmarks"}
            className={cn("absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l shadow-card", T.panel)}
          >
            <div className="flex items-center justify-between border-b border-current/10 px-4 py-3">
              <h2 className="text-sm font-bold">
                {panel === "toc" ? "Contents" : panel === "search" ? "Search in book" : "Bookmarks"}
              </h2>
              <RBtn label="Close panel" onClick={() => setPanel(null)}>
                <X />
              </RBtn>
            </div>
            {panel === "search" && !useRealReader && (
              <div className="border-b border-current/10 p-3">
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words or phrases" aria-label="Search in book" className="h-9 w-full rounded-md border border-current/20 bg-transparent px-3 text-sm outline-none focus:border-primary" />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {/* TOC panel */}
              {panel === "toc" && (
                useRealReader ? (
                  epubToc.length === 0 ? (
                    <p className={cn("p-6 text-center text-sm", T.muted)}>No table of contents available.</p>
                  ) : (
                    epubToc.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { epubRef.current?.jumpTo(item.href); setPanel(null); }}
                        className="flex w-full items-center gap-3 border-b border-current/10 px-4 py-3 text-left text-sm hover:bg-current/5"
                      >
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))
                  )
                ) : (
                  chapters.map((c, i) => (
                    <button key={c.title} type="button" onClick={() => { go(c.startPage); setPanel(null); }} aria-current={i === content.chapter} className={cn("flex w-full items-center justify-between gap-3 border-b border-current/10 px-4 py-3 text-left text-sm hover:bg-current/5", i === content.chapter && "font-bold")}>
                      <span className="truncate">{c.title}</span>
                      <span className={cn("shrink-0 text-xs", T.muted)}>p. {c.startPage}</span>
                    </button>
                  ))
                )
              )}

              {/* Bookmarks panel */}
              {panel === "bookmarks" && (
                useRealReader ? (
                  apiBookmarks.length === 0 ? (
                    <p className={cn("p-6 text-center text-sm", T.muted)}>No bookmarks yet. Use the bookmark button to save a position.</p>
                  ) : (
                    apiBookmarks.map((loc) => {
                      const isPage = /^\d+$/.test(loc);
                      return (
                        <div key={loc} className="flex items-center border-b border-current/10">
                          <button
                            type="button"
                            onClick={() => {
                              if (isPage) pdfRef.current?.goToPage(Number(loc));
                              else epubRef.current?.jumpTo(loc);
                              setPanel(null);
                            }}
                            className="min-w-0 flex-1 px-4 py-3 text-left text-sm hover:bg-current/5"
                          >
                            <span className="font-semibold">{isPage ? `Page ${loc}` : `Position ${loc.slice(0, 20)}â€¦`}</span>
                          </button>
                          <RBtn
                            label="Remove bookmark"
                            onClick={() => setApiBookmarks((prev) => prev.filter((l) => l !== loc))}
                          >
                            <X />
                          </RBtn>
                        </div>
                      );
                    })
                  )
                ) : (
                  bookmarks.length === 0 ? (
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
                  )
                )
              )}

              {/* Search panel (demo mode only) */}
              {panel === "search" && !useRealReader && (
                query.trim().length < 2 ? (
                  <p className={cn("p-6 text-center text-sm", T.muted)}>Type at least two letters.</p>
                ) : results.length === 0 ? (
                  <p className={cn("p-6 text-center text-sm", T.muted)}>No matches for "{query}".</p>
                ) : (
                  results.map((r) => (
                    <button key={r.page} type="button" onClick={() => go(r.page)} className="block w-full border-b border-current/10 px-4 py-3 text-left text-sm hover:bg-current/5">
                      <span className="font-semibold">Page {r.page}</span>
                      <span className={cn("block text-xs", T.muted)}>
                        <Highlight text={r.snippet} q={query} />
                      </span>
                    </button>
                  ))
                )
              )}
            </div>
          </aside>
        )}
      </div>

      {/* â”€â”€ Footer / navigation bar â”€â”€ */}
      <footer className={cn("flex items-center gap-2 border-t px-2 py-2 md:gap-4 md:px-4", T.bar)}>
        {useRealReader ? (
          /* Real reader footer */
          <>
            <RBtn
              label="Previous page"
              onClick={readerPrev}
              disabled={currentPct <= 0 && accessData?.fileType === "epub"}
            >
              <ChevronLeft />
            </RBtn>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {accessData?.fileType === "pdf" && totalPages > 0 ? (
                <input
                  type="range"
                  min={1}
                  max={totalPages}
                  value={pdfCurrentPage}
                  onChange={(e) => pdfRef.current?.goToPage(Number(e.target.value))}
                  aria-label="Go to page"
                  aria-valuetext={`Page ${pdfCurrentPage} of ${totalPages}`}
                  className="h-1.5 w-full cursor-pointer accent-[var(--primary)]"
                />
              ) : (
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={currentPct}
                  readOnly
                  aria-label="Reading progress"
                  aria-valuetext={`${currentPct}% read`}
                  className="h-1.5 w-full cursor-pointer accent-[var(--primary)]"
                />
              )}
            </div>
            <div className={cn("shrink-0 text-right text-xs tabular-nums", T.muted)}>
              {accessData?.fileType === "pdf" && totalPages > 0 ? (
                <>
                  <div>
                    Page {pdfCurrentPage} / {totalPages}
                  </div>
                  <div>{currentPct}% read</div>
                </>
              ) : (
                <div>{currentPct}% read</div>
              )}
            </div>
            <RBtn
              label="Next page"
              onClick={readerNext}
              disabled={currentPct >= 100 && accessData?.fileType === "epub"}
            >
              <ChevronRight />
            </RBtn>
          </>
        ) : (
          /* Demo mode footer */
          <>
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
          </>
        )}
      </footer>
    </main>
  );
}

