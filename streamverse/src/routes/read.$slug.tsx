import { createFileRoute } from "@tanstack/react-router";
import { BookReader } from "@/components/sv/players/BookReader";
import { PlayerGate } from "@/components/sv/players/PlayerGate";
import { findEbook } from "@/lib/data";
import { toItem, useCatalog } from "@/lib/items";

export const Route = createFileRoute("/read/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${findEbook(params.slug)?.title ?? "Read"} — StreamVerse` }, { name: "robots", content: "noindex" }] }),
  component: ReadPage,
});

function ReadPage() {
  const { slug } = Route.useParams();
  const cat = useCatalog();
  const b = cat.ebooks.find((x) => x.slug === slug);
  return <PlayerGate item={b ? toItem("eBook", b) : undefined}>{b && <BookReader key={b.slug} b={b} />}</PlayerGate>;
}
