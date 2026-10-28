import { AuthGate } from "@/components/sv/AuthGate";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { mediaApi } from "@/api/media.api";
import type { ApiEbookAccess } from "@/api/types";
import { BookReader, type BookReaderAccessData } from "@/components/sv/players/BookReader";
import { PlayerGate } from "@/components/sv/players/PlayerGate";
import { GeneralError } from "@/components/sv/states";
import { useApiEbookQuery } from "@/hooks/useApiCatalog";
import { DEMO_MODE } from "@/lib/config";
import { findEbook, type Book } from "@/lib/data";
import { toItem, useCatalog } from "@/lib/items";
import { apiBookToLocal } from "@/lib/api-mappers";

export const Route = createFileRoute("/read/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${findEbook(params.slug)?.title ?? "Read"} — StreamVerse` }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AuthGate fullScreen>
      <ReadPage />
    </AuthGate>
  ),
});

type AccessState = "idle" | "loading" | "ok" | "error";

/** Map backend error codes → human-readable messages shown in the reader error card */
function accessErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("SUBSCRIPTION_REQUIRED")) return "You need an active subscription to read this book.";
  if (msg.includes("PLAN_DOES_NOT_INCLUDE_EBOOKS")) return "Your current plan doesn't include eBooks. Upgrade to access.";
  if (msg.includes("AGE_RESTRICTED")) return "This content is age-restricted.";
  if (msg.includes("CONTENT_NOT_AVAILABLE")) return "This title is not currently available.";
  if (msg.includes("expired")) return "This download has expired. Connect to the internet to renew it.";
  if (msg.includes("MEDIA_NOT_READY")) return "This eBook file is not yet ready. Please try again later.";
  return "Unable to access this eBook. Please try again.";
}

function ReadPage() {
  const { slug } = Route.useParams();
  const cat = useCatalog();
  const apiQuery = useApiEbookQuery(slug);

  const [accessState, setAccessState] = useState<AccessState>("idle");
  const [accessData, setAccessData] = useState<ApiEbookAccess | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Fetch signed access URL in API mode
  // The media API is keyed by content id, not slug, so wait for the book itself to load first.
  const contentId = apiQuery.data?.id;
  useEffect(() => {
    if (DEMO_MODE || !contentId) return;
    setAccessState("loading");
    mediaApi
      .getEbookAccess(contentId)
      .then((res) => {
        const data = res.data;
        // signedUrl or fileType being null means media not ready / access denied
        if (data.signedUrl === null || data.fileType === null) {
          setAccessError(
            data.mediaReady === false
              ? "This eBook file is not yet ready. Please try again later."
              : "Unable to access this eBook. Please try again.",
          );
          setAccessState("error");
        } else {
          setAccessData(data);
          setAccessState("ok");
        }
      })
      .catch((err: unknown) => {
        setAccessError(accessErrorMessage(err));
        setAccessState("error");
      });
  }, [contentId]);

  if (!DEMO_MODE && apiQuery.isLoading) return <div className="h-screen" aria-busy="true" />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const b: Book | undefined = DEMO_MODE
    ? cat.ebooks.find((x) => x.slug === slug)
    : apiQuery.data
      ? apiBookToLocal(apiQuery.data)
      : undefined;

  // Show access error card instead of the reader
  if (!DEMO_MODE && accessState === "error") {
    return (
      <PlayerGate item={b ? toItem("eBook", b) : undefined}>
        <div className="flex h-screen flex-col items-center justify-center bg-[#0b0d0f] px-6 text-white">
          <div className="max-w-md rounded-xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="mb-2 text-base font-semibold">Access Denied</p>
            <p className="text-sm text-white/60">{accessError}</p>
          </div>
        </div>
      </PlayerGate>
    );
  }

  // Build accessData prop for BookReader (API mode only).
  // Only constructed when signedUrl and fileType are confirmed non-null above.
  const readerAccessData: BookReaderAccessData | undefined = (() => {
    if (DEMO_MODE || !accessData || accessData.signedUrl === null || accessData.fileType === null) {
      return undefined;
    }
    const base: BookReaderAccessData = {
      signedUrl: accessData.signedUrl,
      fileType: accessData.fileType,
      contentId: accessData.contentId,
    };
    if (accessData.progress?.location != null) {
      base.initialLocation = accessData.progress.location;
    }
    if (accessData.progress?.page != null) {
      base.initialPage = accessData.progress.page;
    }
    if (accessData.progress?.pct != null) {
      base.initialPct = accessData.progress.pct;
    }
    return base;
  })();

  // In API mode, show spinner while fetching access URL
  const showAccessSpinner = !DEMO_MODE && accessState === "loading";

  return (
    <PlayerGate item={b ? toItem("eBook", b) : undefined}>
      {b && (
        showAccessSpinner ? (
          <div className="flex h-screen items-center justify-center bg-[#0b0d0f]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        ) : (
          <BookReader
            key={b.slug}
            b={b}
            {...(readerAccessData !== undefined ? { accessData: readerAccessData } : {})}
          />
        )
      )}
    </PlayerGate>
  );
}
