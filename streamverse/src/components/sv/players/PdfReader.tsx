import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure the PDF.js worker via Vite's asset URL mechanism
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export interface PdfReaderHandle {
  next: () => void;
  prev: () => void;
  jumpTo: (href: string) => void;
  goToPage: (page: number) => void;
}

interface PdfReaderProps {
  url: string;
  initialPage?: number;
  onPageChange: (page: number, totalPages: number) => void;
  onReady: (totalPages: number) => void;
  onError: (msg: string) => void;
}

export const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(
  function PdfReader({ url, initialPage, onPageChange, onReady, onError }, ref) {
    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Keep callbacks stable
    const onPageChangeRef = useRef(onPageChange);
    onPageChangeRef.current = onPageChange;
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const numPagesRef = useRef(numPages);
    numPagesRef.current = numPages;
    const currentPageRef = useRef(currentPage);
    currentPageRef.current = currentPage;

    useImperativeHandle(ref, () => ({
      next: () => {
        setCurrentPage((p) => Math.min(numPagesRef.current, p + 1));
      },
      prev: () => {
        setCurrentPage((p) => Math.max(1, p - 1));
      },
      jumpTo: (_href: string) => {
        /* no-op for PDF — no named destinations supported in this viewer */
      },
      goToPage: (page: number) => {
        setCurrentPage(Math.max(1, Math.min(numPagesRef.current, page)));
      },
    }));

    // Measure container width for responsive rendering
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (width !== undefined) setContainerWidth(width);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Notify parent when page changes
    useEffect(() => {
      if (numPages > 0) {
        onPageChangeRef.current(currentPage, numPages);
      }
    }, [currentPage, numPages]);

    return (
      <div ref={containerRef} className="h-full w-full overflow-y-auto">
        <Document
          file={url}
          onLoadSuccess={({ numPages: n }: { numPages: number }) => {
            setNumPages(n);
            onReadyRef.current(n);
            // Restore page from progress, clamped to valid range
            if (initialPage !== undefined) {
              setCurrentPage(Math.max(1, Math.min(n, initialPage)));
            }
          }}
          onLoadError={(err: Error) => onErrorRef.current(err.message)}
          loading={
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
            </div>
          }
          className="flex flex-col items-center py-4"
        >
          {containerWidth > 0 ? (
            <Page
              pageNumber={currentPage}
              width={containerWidth - 32}
              renderTextLayer
              renderAnnotationLayer
              loading={
                <div className="flex h-64 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
                </div>
              }
            />
          ) : (
            <Page
              pageNumber={currentPage}
              renderTextLayer
              renderAnnotationLayer
              loading={
                <div className="flex h-64 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
                </div>
              }
            />
          )}
        </Document>
      </div>
    );
  },
);
