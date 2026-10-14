import { createFileRoute } from "@tanstack/react-router";
import { AudiobookPlayer } from "@/components/sv/players/AudiobookPlayer";
import { PlayerGate } from "@/components/sv/players/PlayerGate";
import { findAudiobook } from "@/lib/data";
import { toItem, useCatalog } from "@/lib/items";

export const Route = createFileRoute("/listen/$slug")({
  validateSearch: (s: Record<string, unknown>): { chapter?: number } => (typeof s["chapter"] === "number" && s["chapter"] >= 0 ? { chapter: s["chapter"] } : {}),
  head: ({ params }) => ({ meta: [{ title: `${findAudiobook(params.slug)?.title ?? "Listen"} — StreamVerse` }, { name: "robots", content: "noindex" }] }),
  component: ListenPage,
});

function ListenPage() {
  const { slug } = Route.useParams();
  const { chapter } = Route.useSearch();
  const cat = useCatalog();
  const b = cat.audiobooks.find((x) => x.slug === slug);
  return <PlayerGate item={b ? toItem("Audiobook", b) : undefined}>{b && <AudiobookPlayer key={`${b.slug}-${chapter ?? "x"}`} b={b} startChapter={chapter} />}</PlayerGate>;
}
