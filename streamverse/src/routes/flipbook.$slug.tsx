import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { mediaApi } from "@/api/media.api";
import { AuthGate } from "@/components/sv/AuthGate";
import { PageLoading } from "@/components/sv/PageLoading";
import { FlipbookReaderClient } from "@/components/sv/players/FlipbookReaderClient";
import { PlayerGate } from "@/components/sv/players/PlayerGate";
import { QueryError } from "@/components/sv/QueryError";
import { useApiEbookQuery } from "@/hooks/useApiCatalog";
import { apiBookToLocal } from "@/lib/api-mappers";
import { toItem } from "@/lib/items";

export const Route = createFileRoute("/flipbook/$slug")({
  head: () => ({ meta: [{ title: "Flipbook — StreamVerse" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AuthGate fullScreen>
      <FlipbookPage />
    </AuthGate>
  ),
});

function FlipbookPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const bookQuery = useApiEbookQuery(slug);
  const contentId = bookQuery.data?.id;
  const access = useQuery({
    queryKey: ["flipbook-access", contentId],
    enabled: !!contentId,
    queryFn: async () => (await mediaApi.getFlipbookAccess(contentId!)).data,
    // a signed link is short-lived: fetch a fresh one each time the page is opened
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const back = () => void navigate({ to: "/ebooks/$slug", params: { slug } });

  if (bookQuery.isError) return <QueryError error={bookQuery.error} what="This book" onRetry={() => void bookQuery.refetch()} className="mt-24" />;
  if (bookQuery.isLoading || !bookQuery.data || access.isLoading) return <PageLoading label="Opening the flipbook…" fullScreen />;
  const book = apiBookToLocal(bookQuery.data);
  return (
    <PlayerGate item={toItem("eBook", book)}>
      {access.isError || !access.data?.signedUrl ? (
        <div className="grid h-dvh place-items-center bg-[#0b0d0f] px-6 text-white">
          <QueryError
            error={access.error ?? new Error("no link")}
            what="The flipbook"
            onRetry={() => void access.refetch()}
            className="border-white/10 bg-white/5"
          />
        </div>
      ) : (
        <FlipbookReaderClient url={access.data.signedUrl} title={book.title} storageKey={slug} onClose={back} />
      )}
    </PlayerGate>
  );
}
