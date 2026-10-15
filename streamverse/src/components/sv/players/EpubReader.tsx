import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Epub from "epubjs";
import type { Book as EpubBook, Rendition, Location as EpubLocation } from "epubjs";

export interface TocItem {
  id: string;
  label: string;
  href: string;
}

export interface EpubReaderHandle {
  next: () => void;
  prev: () => void;
  jumpTo: (href: string) => void;
}

interface EpubReaderProps {
  url: string;
  initialLocation?: string | null;
  onLocationChange: (cfi: string, pct: number) => void;
  onReady: (toc: TocItem[]) => void;
  onError: (msg: string) => void;
  theme: "dark" | "light" | "sepia";
  fontSize: number;
}

export const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(
  function EpubReader(
    { url, initialLocation, onLocationChange, onReady, onError, theme, fontSize },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const bookRef = useRef<EpubBook | null>(null);
    const renditionRef = useRef<Rendition | null>(null);
    const locationsReadyRef = useRef(false);
    const [loading, setLoading] = useState(true);

    // Keep callbacks stable across renders without causing effect to re-run
    const onLocationChangeRef = useRef(onLocationChange);
    onLocationChangeRef.current = onLocationChange;
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useImperativeHandle(ref, () => ({
      next: () => {
        renditionRef.current?.next().catch(() => undefined);
      },
      prev: () => {
        renditionRef.current?.prev().catch(() => undefined);
      },
      jumpTo: (href: string) => {
        renditionRef.current?.display(href).catch(() => undefined);
      },
    }));

    // Main init effect — only re-runs when URL changes
    useEffect(() => {
      if (!containerRef.current) return;
      setLoading(true);
      locationsReadyRef.current = false;

      let book: EpubBook;
      try {
        book = Epub(url);
      } catch (err) {
        onErrorRef.current(err instanceof Error ? err.message : "Failed to open EPUB");
        return;
      }
      bookRef.current = book;

      const rendition = book.renderTo(containerRef.current, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated",
      });
      renditionRef.current = rendition;

      rendition.themes.register("light", {
        body: { background: "#ffffff", color: "#222222" },
      });
      rendition.themes.register("dark", {
        body: { background: "#1a1a1a", color: "#e0e0e0" },
      });
      rendition.themes.register("sepia", {
        body: { background: "#f4ecd8", color: "#5c4b37" },
      });
      rendition.themes.select(theme);
      rendition.themes.fontSize(`${fontSize}%`);

      rendition.display(initialLocation ?? undefined).catch(() => {
        onErrorRef.current("Failed to display EPUB content");
      });

      book.loaded.navigation
        .then((nav) => {
          onReadyRef.current(
            nav.toc.map((item) => ({ id: item.id, label: item.label.trim(), href: item.href })),
          );
        })
        .catch(() => {
          onReadyRef.current([]);
        });

      rendition.on("relocated", (location: EpubLocation) => {
        const cfi = location.start.cfi;
        if (locationsReadyRef.current) {
          const pct = book.locations.percentageFromCfi(cfi);
          onLocationChangeRef.current(cfi, Math.round(pct * 100));
        } else {
          onLocationChangeRef.current(cfi, 0);
        }
      });

      book.ready
        .then(() => {
          setLoading(false);
          return book.locations.generate(1024);
        })
        .then(() => {
          locationsReadyRef.current = true;
        })
        .catch((err: unknown) => {
          onErrorRef.current(err instanceof Error ? err.message : "Failed to process EPUB");
        });

      return () => {
        try {
          rendition.destroy();
        } catch {
          /* ignore cleanup errors */
        }
        try {
          book.destroy();
        } catch {
          /* ignore cleanup errors */
        }
        bookRef.current = null;
        renditionRef.current = null;
        locationsReadyRef.current = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url]);

    // Theme changes: no re-init, just update the rendition
    useEffect(() => {
      renditionRef.current?.themes.select(theme);
    }, [theme]);

    // Font size changes: no re-init, just update the rendition
    useEffect(() => {
      renditionRef.current?.themes.fontSize(`${fontSize}%`);
    }, [fontSize]);

    return (
      <div className="relative h-full w-full">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  },
);
