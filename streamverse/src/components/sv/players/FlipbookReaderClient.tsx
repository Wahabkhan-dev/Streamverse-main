import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentProps } from "react";
import type { FlipbookReader } from "./FlipbookReader";
import { PageLoading } from "../PageLoading";

// pdf.js touches `document` as soon as it is imported, which crashes server-side rendering: the real reader is imported
// lazily and only after mounting in the browser (the same approach as the PDF reader).
const Lazy = lazy(() => import("./FlipbookReader").then((m) => ({ default: m.FlipbookReader })));

export function FlipbookReaderClient(props: ComponentProps<typeof FlipbookReader>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <PageLoading label="Preparing your flipbook…" fullScreen />;
  return (
    <Suspense fallback={<PageLoading label="Preparing your flipbook…" fullScreen />}>
      <Lazy {...props} />
    </Suspense>
  );
}
