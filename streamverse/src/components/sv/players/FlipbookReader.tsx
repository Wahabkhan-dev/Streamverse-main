import { ChevronLeft, ChevronRight, Expand, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { PageFlip } from "page-flip";
import { useEffect, useRef, useState } from "react";
import { pdfjs } from "react-pdf";
import { QueryError } from "../QueryError";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/** Pages kept rendered around the page being read (the rest are drawn only when the reader gets near them). */
const AHEAD = 6;
const BEHIND = 3;
const ZOOMS = [1, 1.25, 1.5, 2];

/**
 * The flipbook: the book's PDF as pages that turn like a printed book (drag a corner, click a side, use the arrow keys or the
 * buttons). Pages are drawn on demand as the reader nears them, so a long book opens quickly and stays light.
 */
export function FlipbookReader({ url, title, storageKey, onClose }: { url: string; title: string; storageKey: string; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const flip = useRef<PageFlip | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let destroy = () => {};
    void (async () => {
      try {
        const task = pdfjs.getDocument({ url });
        destroy = () => void task.destroy();
        const pdf = await task.promise;
        if (cancelled || !stage.current) return;
        const first = await pdf.getPage(1);
        const base = first.getViewport({ scale: 1 });
        const total = pdf.numPages;

        // one white sheet per page; the first and last are hard covers
        const sheets: HTMLDivElement[] = [];
        const host = document.createElement("div");
        for (let i = 1; i <= total; i++) {
          const sheet = document.createElement("div");
          sheet.className = "sv-flip-page";
          sheet.style.background = "#fff";
          if (i === 1 || i === total) sheet.dataset["density"] = "hard";
          sheet.innerHTML = `<div style="display:grid;place-items:center;height:100%;color:#9ca3af;font:12px system-ui">${i}</div>`;
          host.appendChild(sheet);
          sheets.push(sheet);
        }
        stage.current.appendChild(host);

        const urls = new Map<number, string>();
        const drawing = new Set<number>();
        const ensure = async (i: number) => {
          if (urls.has(i) || drawing.has(i) || i < 1 || i > total || cancelled) return;
          drawing.add(i);
          try {
            const p = await pdf.getPage(i);
            const scale = Math.min(2, (window.devicePixelRatio || 1)) * (900 / base.height);
            const vp = p.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(vp.width);
            canvas.height = Math.floor(vp.height);
            await p.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, canvas }).promise;
            const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
            if (!blob || cancelled) return;
            const objectUrl = URL.createObjectURL(blob);
            urls.set(i, objectUrl);
            sheets[i - 1]!.innerHTML = `<img src="${objectUrl}" alt="Page ${i}" draggable="false" style="width:100%;height:100%;object-fit:contain;display:block;user-select:none">`;
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
        const pf = new PageFlip(host, {
          width: Math.round(base.width),
          height: Math.round(base.height),
          size: "stretch",
          minWidth: 280,
          maxWidth: 900,
          minHeight: 380,
          maxHeight: 1300,
          maxShadowOpacity: 0.45,
          showCover: true,
          mobileScrollSupport: false,
          usePortrait: true,
          startPage: startAt,
          flippingTime: 700,
        });
        pf.loadFromHTML(host.querySelectorAll<HTMLElement>(".sv-flip-page"));
        flip.current = pf;
        pf.on("flip", (e) => {
          const index = Number(e.data);
          setPage(index);
          around(index);
          try {
            localStorage.setItem(`sv-flipbook-${storageKey}`, String(index));
          } catch {
            /* storage unavailable */
          }
        });
        setCount(total);
        setPage(startAt);
        around(startAt);
        setState("ready");

        destroy = () => {
          try {
            pf.destroy();
          } catch {
            /* already gone */
          }
          for (const u of urls.values()) URL.revokeObjectURL(u);
          void task.destroy();
        };
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      flip.current = null;
      destroy();
    };
  }, [url, storageKey]);

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

  const scale = ZOOMS[zoom] ?? 1;
  return (
    <div ref={frame} className="flex h-dvh flex-col bg-[#0b0d0f] text-white" data-testid="flipbook">
      <header className="flex items-center gap-3 border-b border-white/10 px-3 py-2 md:px-5">
        <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-semibold hover:bg-white/10" aria-label="Close flipbook">
          ← Back
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
        <button className="grid size-9 place-items-center rounded-md hover:bg-white/10 disabled:opacity-40" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
          <ZoomOut className="size-4" />
        </button>
        <button className="grid size-9 place-items-center rounded-md hover:bg-white/10 disabled:opacity-40" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>
          <ZoomIn className="size-4" />
        </button>
        <button
          className="grid size-9 place-items-center rounded-md hover:bg-white/10"
          aria-label={full ? "Exit full screen" : "Full screen"}
          onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : frame.current?.requestFullscreen())}
        >
          {full ? <Minimize2 className="size-4" /> : <Expand className="size-4" />}
        </button>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
        {state === "loading" && (
          <div role="status" aria-busy="true" className="absolute inset-0 grid place-items-center text-sm text-white/60" data-testid="flipbook-loading">
            Preparing your flipbook…
          </div>
        )}
        {state === "error" && <QueryError error={error} what="This flipbook" onRetry={() => window.location.reload()} />}
        <div ref={stage} className="origin-center transition-transform" style={{ transform: `scale(${scale})` }} />
      </main>

      {state === "ready" && (
        <footer className="flex items-center gap-3 border-t border-white/10 px-3 py-2 md:px-5">
          <button className="grid size-9 place-items-center rounded-md hover:bg-white/10" aria-label="Previous page" onClick={() => flip.current?.flipPrev()}>
            <ChevronLeft className="size-5" />
          </button>
          <input
            type="range"
            min={1}
            max={count}
            value={page + 1}
            onChange={(e) => flip.current?.turnToPage(Number(e.target.value) - 1)}
            aria-label="Go to page"
            aria-valuetext={`Page ${page + 1} of ${count}`}
            className="h-1.5 flex-1 cursor-pointer accent-[var(--primary)]"
          />
          <span className="w-28 shrink-0 text-right text-xs tabular-nums text-white/70" data-testid="flipbook-page">
            Page {page + 1} / {count}
          </span>
          <button className="grid size-9 place-items-center rounded-md hover:bg-white/10" aria-label="Next page" onClick={() => flip.current?.flipNext()}>
            <ChevronRight className="size-5" />
          </button>
        </footer>
      )}
    </div>
  );
}
