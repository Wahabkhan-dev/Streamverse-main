import { createFileRoute } from "@tanstack/react-router";
import { BookDetail } from "@/components/sv/BookDetail";
import { Gated } from "@/components/sv/Gate";
import { ContentUnavailable, GeneralError } from "@/components/sv/states";
import { useApiAudiobookQuery } from "@/hooks/useApiCatalog";
import { DEMO_MODE } from "@/lib/config";
import { findAudiobook, type Book } from "@/lib/data";
import { itemEntity, toItem, useCatalog } from "@/lib/items";
import { apiBookToLocal } from "@/lib/api-mappers";
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

  if (!DEMO_MODE && apiQuery.isLoading) return <div className="py-24" aria-busy="true" />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const b: Book | undefined = DEMO_MODE
    ? cat.audiobooks.find((x) => x.slug === slug)
    : apiQuery.data
      ? apiBookToLocal(apiQuery.data)
      : undefined;

  if (!DEMO_MODE && !b) return <ContentUnavailable />;

  const related = b ? relatedTo(toItem("Audiobook", b), cat.listed, 12).map((i) => itemEntity(i) as Book) : [];

  return (
    <Gated item={b ? toItem("Audiobook", b) : undefined}>
      {b && <BookDetail b={b} kind="audiobook" related={related} />}
    </Gated>
  );
}
