import { createFileRoute } from "@tanstack/react-router";
import { BookReader } from "@/components/sv/players/BookReader";
import { PlayerGate } from "@/components/sv/players/PlayerGate";
import { GeneralError } from "@/components/sv/states";
import { useApiEbookQuery } from "@/hooks/useApiCatalog";
import { DEMO_MODE } from "@/lib/config";
import { findEbook, type Book } from "@/lib/data";
import { toItem, useCatalog } from "@/lib/items";
import { apiBookToLocal } from "@/lib/api-mappers";

export const Route = createFileRoute("/read/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${findEbook(params.slug)?.title ?? "Read"} — StreamVerse` }, { name: "robots", content: "noindex" }] }),
  component: ReadPage,
});

function ReadPage() {
  const { slug } = Route.useParams();
  const cat = useCatalog();
  const apiQuery = useApiEbookQuery(slug);

  if (!DEMO_MODE && apiQuery.isLoading) return <div className="h-screen" aria-busy="true" />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const b: Book | undefined = DEMO_MODE
    ? cat.ebooks.find((x) => x.slug === slug)
    : apiQuery.data
      ? apiBookToLocal(apiQuery.data)
      : undefined;

  return <PlayerGate item={b ? toItem("eBook", b) : undefined}>{b && <BookReader key={b.slug} b={b} />}</PlayerGate>;
}
