import { createFileRoute } from "@tanstack/react-router";
import { BookDetail } from "@/components/sv/BookDetail";
import { Gated } from "@/components/sv/Gate";
import { itemEntity, toItem, useCatalog } from "@/lib/items";
import { relatedTo } from "@/lib/related";
import { findEbook, type Book } from "@/lib/data";

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
  component: eBookDetail,
});

function eBookDetail() {
  const { slug } = Route.useParams();
  const cat = useCatalog();
  const b = cat.ebooks.find((x) => x.slug === slug);
  return (
    <Gated item={b ? toItem("eBook", b) : undefined}>
      {b && <BookDetail b={b} kind="ebook" related={relatedTo(toItem("eBook", b), cat.listed, 12).map((i) => itemEntity(i) as Book)} />}
    </Gated>
  );
}
