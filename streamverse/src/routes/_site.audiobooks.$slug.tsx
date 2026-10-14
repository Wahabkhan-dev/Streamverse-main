import { createFileRoute } from "@tanstack/react-router";
import { BookDetail } from "@/components/sv/BookDetail";
import { Gated } from "@/components/sv/Gate";
import { itemEntity, toItem, useCatalog } from "@/lib/items";
import { relatedTo } from "@/lib/related";
import { findAudiobook, type Book } from "@/lib/data";

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
  const b = cat.audiobooks.find((x) => x.slug === slug);
  return (
    <Gated item={b ? toItem("Audiobook", b) : undefined}>
      {b && <BookDetail b={b} kind="audiobook" related={relatedTo(toItem("Audiobook", b), cat.listed, 12).map((i) => itemEntity(i) as Book)} />}
    </Gated>
  );
}
