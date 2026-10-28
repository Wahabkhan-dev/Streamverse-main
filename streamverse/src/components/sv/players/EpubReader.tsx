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
  /** Jump to a point in the book (0-100). Returns false while the page positions are still being calculated. */
  goToPercent: (pct: number) => boolean;
}

interface EpubReaderProps {
  url: string;
  initialLocation?: string | null;
  onLocationChange: (cfi: string, pct: number, edges: { atStart: boolean; atEnd: boolean }) => void;
  onReady: (toc: TocItem[]) => void;
  onError: (msg: string) => void;
  theme: "dark" | "light" | "sepia";
  fontSize: number;
}

interface SpineSection {
  href: string;
  index: number;
  linear: boolean;
}

/** The sections a reader pages through, in order (the cover and other non-linear files are not part of the reading flow). */
function linearSections(book: EpubBook): SpineSection[] {
  const items = (book.spine as unknown as { spineItems?: SpineSection[] }).spineItems ?? [];
  return items.filter((s) => s.linear);
}

/**
 * How far through the book this page is (0-100). Text-rich books use epub.js's reading positions; books that are mostly
 * images or layout have none, so there it is the page's place within its section and the section's place in the book.
 */
function percentAt(book: EpubBook, location: EpubLocation, positionsReady: boolean): number {
  const cfi = location.start.cfi;
  if (positionsReady && book.locations.length() > 1)
    return Math.round(book.locations.percentageFromCfi(cfi) * 100);
  const sections = linearSections(book);
  if (!sections.length) return 0;
  const at = Math.max(
    0,
    sections.findIndex((s) => s.index === location.start.index),
  );
  const { page = 1, total = 1 } = location.start.displayed ?? {};
  const within = total > 1 ? (page - 1) / (total - 1) : 0;
  return Math.round(((at + within) / sections.length) * 100);
}

export const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(function EpubReader(
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
    goToPercent: (pct: number) => {
      const book = bookRef.current;
      const rendition = renditionRef.current;
      if (!book || !rendition) return false;
      const target = Math.max(0, Math.min(100, pct)) / 100;
      // Books with real text have a table of reading positions; use it. Image-heavy books have none, so go by pages instead.
      if (locationsReadyRef.current && book.locations.length() > 1) {
        const cfi = book.locations.cfiFromPercentage(target);
        if (cfi && cfi !== "-1") {
          rendition.display(cfi).catch(() => undefined);
          return true;
        }
      }
      const sections = linearSections(book);
      if (!sections.length) return false;
      const t = Math.min(target * sections.length, sections.length - 0.000001);
      const section = sections[Math.floor(t)]!;
      const frac = t - Math.floor(t);
      void rendition
        .display(section.href)
        .then(() => {
          const loc = (rendition as unknown as { currentLocation: () => EpubLocation | null }).currentLocation();
          const total = loc?.start?.displayed?.total ?? 1;
          const manager = (rendition as unknown as {
            manager?: { layout?: { delta: number }; scrollTo: (x: number, y: number, silent?: boolean) => void };
          }).manager;
          const delta = manager?.layout?.delta;
          if (!manager || !delta || total < 2) return;
          manager.scrollTo(Math.round(frac * (total - 1)) * delta, 0, false);
        })
        .catch(() => undefined);
      return true;
    },
  }));

  // Main init effect — only re-runs when URL changes
  useEffect(() => {
    if (!containerRef.current) return;
    setLoading(true);
    locationsReadyRef.current = false;

    let book: EpubBook;
    try {
      // the address is a signed storage link without ".epub" in it: say so, or epub.js probes it as an unpacked folder (404s on META-INF/container.xml)
      book = Epub(url, { openAs: "epub" });
    } catch (err) {
      onErrorRef.current(err instanceof Error ? err.message : "Failed to open EPUB");
      return;
    }
    bookRef.current = book;

    // Many real EPUBs list their files in the manifest percent-encoded ("name_%282%29.png") but write the page HTML with the
    // plain name ("name_(2).png"). epub.js swaps images by matching the manifest spelling, so those images stay broken
    // (relative URLs that 404). After its own swap, do the same swap again for the decoded spelling.
    void book.opened
      .then(() => {
        // epub.js's own typings do not cover these internals
        const b = book as unknown as {
          resources: { relativeTo: (u: string) => string[]; replacementUrls: Array<string | null> };
          spine: {
            hooks: {
              serialize: {
                register: (
                  fn: (output: string, section: { url: string; output?: string }) => void,
                ) => void;
              };
            };
          };
        };
        b.spine.hooks.serialize.register((output, section) => {
          const rel = b.resources.relativeTo(section.url);
          let html = section.output ?? output;
          rel.forEach((encoded, i) => {
            const blob = b.resources.replacementUrls[i];
            if (!blob) return;
            let plain = encoded;
            try {
              plain = decodeURI(encoded);
            } catch {
              /* keep the encoded spelling */
            }
            if (plain !== encoded) html = html.split(plain).join(blob);
          });
          section.output = html;
        });
      })
      .catch(() => undefined);

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
      const edges = { atStart: !!location.atStart, atEnd: !!location.atEnd };
      onLocationChangeRef.current(cfi, percentAt(book, location, locationsReadyRef.current), edges);
    });

    book.ready
      .then(() => {
        setLoading(false);
        return book.locations.generate(1024);
      })
      .then(() => {
        locationsReadyRef.current = true;
        // Page turns made before the locations finished generating reported 0%; re-report where the reader is now.
        try {
          const here = (
            rendition as unknown as { currentLocation: () => EpubLocation | null }
          ).currentLocation();
          const cfi = here?.start?.cfi;
          if (cfi)
            onLocationChangeRef.current(
              cfi,
              percentAt(book, here!, true),
              { atStart: !!here?.atStart, atEnd: !!here?.atEnd },
            );
        } catch {
          /* the next page turn reports it */
        }
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
});
