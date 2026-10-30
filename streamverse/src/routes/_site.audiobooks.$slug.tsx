import { createFileRoute } from "@tanstack/react-router";
import { BookDetail } from "@/components/sv/BookDetail";
import { Gated, PreviewBanner } from "@/components/sv/Gate";
import { ContentUnavailable, GeneralError } from "@/components/sv/states";
import { useApiAudiobookQuery, useCachedCard } from "@/hooks/useApiCatalog";
import { DetailSkeleton } from "@/components/sv/DetailSkeleton";
import { DEMO_MODE } from "@/lib/config";
import { findAudiobook, type Book } from "@/lib/data";
import { itemEntity, toItem, useCatalog } from "@/lib/items";
import { apiBookToLocal, mixedCardToItem } from "@/lib/api-mappers";
import { relatedTo } from "@/lib/related";

export const Route = createFileRoute("/_site/audiobooks/$slug")({
  head: ({ params }) => {
    const loaderData = findAudiobook(params.slug);
    return loaderData
      ? {
          meta: [
            { title: `${loaderData.title} — Audiobook on StreamVerse` },
            { name: "description", content: `Listen to ${loaderData.title}, narrated by ${loaderData.narrator ?? 'our narrators'}.` },
            { property: "og:title", content: `${loaderData.title} — StreamVerse` },
            { property: "og:description", content: `Narrated by ${loaderData.narrator ?? "our narrators"}.` },
          ],
        }
      : { meta: [{ title: "Audiobook — StreamVerse" }] };
  },
  component: AudiobookDetail,
});

function AudiobookDetail() {
  const { slug } = Route.useParams();
  const cat = useCatalog();
  const apiQuery = useApiAudiobookQuery(slug);
  const peek = useCachedCard(slug);

  if (!DEMO_MODE && apiQuery.isLoading) return <DetailSkeleton peek={peek} />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const b: Book | undefined = DEMO_MODE
    ? cat.audiobooks.find((x) => x.slug === slug)
    : apiQuery.data
      ? apiBookToLocal(apiQuery.data)
      : undefined;

  if (!DEMO_MODE && !b) return <ContentUnavailable />;

  // live mode: the server's list of real titles (the local catalog only holds demo titles)
  const related = DEMO_MODE
    ? b
      ? relatedTo(toItem("Audiobook", b), cat.listed, 12).map((i) => itemEntity(i) as Book)
      : []
    : (apiQuery.data?.related ?? []).map((c) => itemEntity(mixedCardToItem(c)) as Book);

  return (
    <>
      <PreviewBanner status={apiQuery.data?.previewStatus} />
      <Gated item={b ? toItem("Audiobook", b) : undefined}>
        {b && <BookDetail b={b} kind="audiobook" related={related} />}
      </Gated>
    </>
  );
}
