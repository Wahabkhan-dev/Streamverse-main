import { createFileRoute } from "@tanstack/react-router";
import { BookDetail } from "@/components/sv/BookDetail";
import { Gated, PreviewBanner } from "@/components/sv/Gate";
import { ContentUnavailable, GeneralError } from "@/components/sv/states";
import { useApiEbookQuery } from "@/hooks/useApiCatalog";
import { DEMO_MODE } from "@/lib/config";
import { findEbook, type Book } from "@/lib/data";
import { itemEntity, toItem, useCatalog } from "@/lib/items";
import { apiBookToLocal, mixedCardToItem } from "@/lib/api-mappers";
import { relatedTo } from "@/lib/related";

export const Route = createFileRoute("/_site/ebooks/$slug")({
  head: ({ params }) => {
    const loaderData = findEbook(params.slug);
    return loaderData
      ? {
          meta: [
            { title: `${loaderData.title} by ${loaderData.author} — StreamVerse eBooks` },
            { name: "description", content: `Read ${loaderData.title} by ${loaderData.author} on StreamVerse.` },
            { property: "og:title", content: `${loaderData.title} — StreamVerse` },
            { property: "og:description", content: `Read ${loaderData.title} by ${loaderData.author}.` },
          ],
        }
      : { meta: [{ title: "eBook — StreamVerse" }] };
  },
  component: EbookDetailPage,
});

function EbookDetailPage() {
  const { slug } = Route.useParams();
  const cat = useCatalog();
  const apiQuery = useApiEbookQuery(slug);

  if (!DEMO_MODE && apiQuery.isLoading) return <div className="py-24" aria-busy="true" />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const b: Book | undefined = DEMO_MODE
    ? cat.ebooks.find((x) => x.slug === slug)
    : apiQuery.data
      ? apiBookToLocal(apiQuery.data)
      : undefined;

  if (!DEMO_MODE && !b) return <ContentUnavailable />;

  // live mode: the server's list of real titles (the local catalog only holds demo titles)
  const related = DEMO_MODE
    ? b
      ? relatedTo(toItem("eBook", b), cat.listed, 12).map((i) => itemEntity(i) as Book)
      : []
    : (apiQuery.data?.related ?? []).map((c) => itemEntity(mixedCardToItem(c)) as Book);

  return (
    <>
      <PreviewBanner status={apiQuery.data?.previewStatus} />
      <Gated item={b ? toItem("eBook", b) : undefined}>
        {b && <BookDetail b={b} kind="ebook" related={related} />}
      </Gated>
    </>
  );
}
