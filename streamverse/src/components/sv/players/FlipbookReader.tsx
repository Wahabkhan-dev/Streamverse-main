import { BookOpen, ChevronLeft, ChevronRight, Expand, Minimize2, RectangleVertical, ZoomIn, ZoomOut } from "lucide-react";
import { PageFlip } from "page-flip";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pdfjs } from "react-pdf";
import { QueryError } from "../QueryError";
import { DEFAULT_RATIO, flipLayout, pageLabel } from "./flipbookLayout";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/** Pages kept rendered around the page being read (the rest are drawn only when the reader gets near them). */
const AHEAD = 6;
const BEHIND = 3;
const ZOOMS = [1, 1.25, 1.5, 2];
/** Space around the book inside the reading area (matches the p-3 on the scroller). */
const PAD = 12;
const VIEW_KEY = "sv-flipbook-view";

const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) !== "single";
  } catch {
    return true;
  }
};

/** What the loaded PDF gives the reader: its pages as white sheets (filled in on demand) and the page shape. */
interface Book {
  total: number;
  baseW: number;
  baseH: number;
  sheets: HTMLDivElement[];
  around: (index: number) => void;
}

/**
 * The flipbook: the book's PDF as pages that turn like a printed book (drag a corner, click a side, use the arrow keys or the
 * buttons). Wide screens show a double-page spread by default (with a switch to one page); phones and narrow windows always show
 * one page. The book's size is worked out from the reading area before any page is drawn and resized (never scaled), so nothing
 * shifts while pages load or turn, and dragging a corner stays exactly under the finger at every zoom.
 */
export function FlipbookReader({ url, title, storageKey, onClose }: { url: string; title: string; storageKey: string; onClose: () => void }) {
  const area = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const flip = useRef<PageFlip | null>(null);
  const book = useRef<Book | null>(null);
  const pageRef = useRef(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [full, setFull] = useState(false);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [wantSpread, setWantSpread] = useState(readView);

  // The reading area is measured before the first paint, so the stage has its final size from the start.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.max(0, el.clientWidth - PAD * 2);
      const h = Math.max(0, el.clientHeight - PAD * 2);
      setAvail((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const layout = flipLayout({ availW: avail.w, availH: avail.h, ratio, wantSpread, zoom: ZOOMS[zoom] ?? 1 });

  // 1. Open the PDF and prepare one white sheet per page (the first and last are hard covers).
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    void (async () => {
      try {
        const task = pdfjs.getDocument({ url });
        cleanup = () => void task.destroy();
        const pdf = await task.promise;
        if (cancelled) return;
        const first = await pdf.getPage(1);
        const base = first.getViewport({ scale: 1 });
        const total = pdf.numPages;

        const sheets: HTMLDivElement[] = [];
        for (let i = 1; i <= total; i++) {
          const sheet = document.createElement("div");
          sheet.className = "sv-flip-page";
          sheet.style.background = "#fff";
          if (i === 1 || i === total) sheet.dataset["density"] = "hard";
          sheet.innerHTML = `<div style="display:grid;place-items:center;height:100%;color:#9ca3af;font:12px system-ui">${i}</div>`;
          sheets.push(sheet);
        }

        // sharp enough for a big screen, without drawing more pixels than the screen can show
        const targetH = Math.min(2200, Math.max(1200, Math.round((window.screen?.height ?? 900) * Math.min(2, window.devicePixelRatio || 1))));
        const urls = new Map<number, string>();
        const drawing = new Set<number>();
        const ensure = async (i: number) => {
          if (urls.has(i) || drawing.has(i) || i < 1 || i > total || cancelled) return;
          drawing.add(i);
          try {
            const p = await pdf.getPage(i);
            const vp = p.getViewport({ scale: targetH / base.height });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(vp.width);
            canvas.height = Math.floor(vp.height);
            await p.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas }).promise;
            const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
            if (!blob || cancelled) return;
            const objectUrl = URL.createObjectURL(blob);
            urls.set(i, objectUrl);
            sheets[i - 1]!.innerHTML = `<img src="${objectUrl}" alt="Page ${i}" draggable="false" style="width:100%;height:100%;object-fit:contain;display:block;user-select:none;-webkit-user-drag:none">`;
          } finally {
            drawing.delete(i);
          }
        };
        const around = (index: number) => {
          for (let i = Math.max(1, index + 1 - BEHIND); i <= Math.min(total, index + 1 + AHEAD); i++) void ensure(i);
        };

        let startAt = 0;
        try {
          startAt = Math.min(total - 1, Math.max(0, Number(localStorage.getItem(`sv-flipbook-${storageKey}`) ?? 0)));
        } catch {
          /* no saved place */
        }
        pageRef.current = startAt;
        book.current = { total, baseW: Math.round(base.width), baseH: Math.round(base.height), sheets, around };
        cleanup = () => {
          for (const u of urls.values()) URL.revokeObjectURL(u);
          void task.destroy();
        };
        setRatio(base.width / base.height);
        setCount(total);
        setPage(startAt);
        around(startAt);
        setState("ready");
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      book.current = null;
      cleanup();
    };
  }, [url, storageKey]);

  // 2. Build the book. It is rebuilt only when it changes between one page and a spread (it then opens on the same page).
  const spread = layout.spread;
  useEffect(() => {
    const b = book.current;
    const mount = stage.current;
    if (state !== "ready" || !b || !mount) return undefined;

    const host = document.createElement("div");
    for (const sheet of b.sheets) {
      // a sheet that was in an earlier book carries that book's classes and positions: start it clean
      const density = sheet.dataset["density"];
      sheet.className = "sv-flip-page";
      sheet.removeAttribute("style");
      sheet.style.background = "#fff";
      if (density) sheet.dataset["density"] = density;
      host.appendChild(sheet);
    }
    mount.replaceChildren(host);

    const pf = new PageFlip(host, {
      width: b.baseW,
      height: b.baseH,
      size: "stretch",
      // the book switches to one page when it is narrower than twice minWidth: never for a spread, always for single
      minWidth: spread ? 1 : 3000,
      maxWidth: 6000,
      minHeight: 1,
      maxHeight: 12000,
      maxShadowOpacity: 0.5,
      showCover: true,
      // the page being dragged follows the finger, so the page behind it must not scroll
      mobileScrollSupport: false,
      usePortrait: true,
      startPage: Math.min(b.total - 1, pageRef.current),
      flippingTime: 800,
      swipeDistance: 25,
      showPageCorners: true,
    });
    pf.loadFromHTML(b.sheets);
    // the library gives the host a minimum width for its own layout; here the stage already has the exact size
    host.style.minWidth = "0";
    host.style.minHeight = "0";
    pf.update();
    flip.current = pf;
    pf.on("flip", (e) => {
      const index = Number(e.data);
      pageRef.current = index;
      setPage(index);
      b.around(index);
      try {
        localStorage.setItem(`sv-flipbook-${storageKey}`, String(index));
      } catch {
        /* storage unavailable */
      }
    });
    return () => {
      flip.current = null;
      try {
        pf.destroy();
      } catch {
        /* already gone */
      }
    };
  }, [state, spread, storageKey]);

  // 3. A new size (window resized, zoom changed) re-fits the same book.
  useEffect(() => {
    flip.current?.update();
  }, [layout.bookW, layout.pageH]);

  // keyboard: arrows turn pages
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") flip.current?.flipNext();
      else if (e.key === "ArrowLeft") flip.current?.flipPrev();
      else if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const toggleView = () =>
    setWantSpread((v) => {
      try {
        localStorage.setItem(VIEW_KEY, v ? "single" : "double");
      } catch {
        /* storage unavailable */
      }
      return !v;
    });

  const ready = state === "ready";
  const btn = "grid size-9 place-items-center rounded-md hover:bg-white/10 disabled:opacity-40";
  return (
    <div ref={frame} className="flex h-dvh flex-col overflow-hidden bg-[#0b0d0f] text-white" data-testid="flipbook">
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2 md:px-5">
        <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-semibold hover:bg-white/10" aria-label="Close flipbook">
          ← Back
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
        {/* the choice only exists where a spread fits: phones always read one page */}
        {layout.canSpread && (
          <button
            className={btn}
            aria-label={layout.spread ? "Single page view" : "Double page view"}
            aria-pressed={layout.spread}
            title={layout.spread ? "Switch to single page" : "Switch to double page"}
            disabled={!ready}
            onClick={toggleView}
          >
            {layout.spread ? <RectangleVertical className="size-4" /> : <BookOpen className="size-4" />}
          </button>
        )}
        <button className={btn} aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
          <ZoomOut className="size-4" />
        </button>
        <button className={btn} aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>
          <ZoomIn className="size-4" />
        </button>
        <button className={btn} aria-label={full ? "Exit full screen" : "Full screen"} onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : frame.current?.requestFullscreen())}>
          {full ? <Minimize2 className="size-4" /> : <Expand className="size-4" />}
        </button>
      </header>

      {/* `area` is what is measured and never scrolls; the scroller inside it only scrolls when zoomed in */}
      <main ref={area} className="relative min-h-0 flex-1" data-layout={layout.spread ? "double" : "single"}>
        <div className="absolute inset-0 flex overflow-auto p-3">
          <div ref={stage} className="m-auto shrink-0" style={{ width: layout.bookW, height: layout.pageH }} />
        </div>
        {state === "loading" && (
          <div role="status" aria-busy="true" className="absolute inset-0 grid place-items-center bg-[#0b0d0f] text-sm text-white/60" data-testid="flipbook-loading">
            Preparing your flipbook…
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 grid place-items-center bg-[#0b0d0f]">
            <QueryError error={error} what="This flipbook" onRetry={() => window.location.reload()} />
          </div>
        )}
      </main>

      {/* always present, so the reading area keeps the same height before and after the book is ready */}
      <footer className="flex items-center gap-3 border-t border-white/10 px-3 py-2 md:px-5">
        <button className={btn} aria-label="Previous page" disabled={!ready} onClick={() => flip.current?.flipPrev()}>
          <ChevronLeft className="size-5" />
        </button>
        <input
          type="range"
          min={1}
          max={Math.max(count, 1)}
          value={page + 1}
          disabled={!ready}
          onChange={(e) => flip.current?.turnToPage(Number(e.target.value) - 1)}
          aria-label="Go to page"
          aria-valuetext={`Page ${page + 1} of ${count}`}
          className="h-1.5 flex-1 cursor-pointer accent-[var(--primary)]"
        />
        <span className="w-36 shrink-0 text-right text-xs tabular-nums text-white/70" data-testid="flipbook-page">
          {ready ? pageLabel(page, count, layout.spread) : " "}
        </span>
        <button className={btn} aria-label="Next page" disabled={!ready} onClick={() => flip.current?.flipNext()}>
          <ChevronRight className="size-5" />
        </button>
      </footer>
    </div>
  );
}
