import { forwardRef, lazy, Suspense, useEffect, useState } from "react";
import type { PdfReaderHandle, PdfReaderProps } from "./PdfReader";

// pdf.js touches `document` as soon as it is imported, which crashes server-side rendering. The real reader is
// therefore imported lazily and only after the component has mounted in the browser (effects never run on the server).
const LazyPdfReader = lazy(() => import("./PdfReader").then((m) => ({ default: m.PdfReader })));

const Spinner = () => (
  <div className="flex h-64 items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
  </div>
);

export const PdfReaderClient = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReaderClient(props, ref) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Spinner />;
  return (
    <Suspense fallback={<Spinner />}>
      <LazyPdfReader ref={ref} {...props} />
    </Suspense>
  );
});
