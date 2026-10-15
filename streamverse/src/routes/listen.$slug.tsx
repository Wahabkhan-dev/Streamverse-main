import { createFileRoute } from "@tanstack/react-router";
import { AudiobookPlayer } from "@/components/sv/players/AudiobookPlayer";
import { PlayerGate } from "@/components/sv/players/PlayerGate";
import { GeneralError } from "@/components/sv/states";
import { useApiAudiobookQuery } from "@/hooks/useApiCatalog";
import { DEMO_MODE } from "@/lib/config";
import { findAudiobook, type Book } from "@/lib/data";
import { toItem, useCatalog } from "@/lib/items";
import { apiBookToLocal } from "@/lib/api-mappers";

export const Route = createFileRoute("/listen/$slug")({
  validateSearch: (s: Record<string, unknown>): { chapter?: number } => (typeof s["chapter"] === "number" && s["chapter"] >= 0 ? { chapter: s["chapter"] } : {}),
  head: ({ params }) => ({ meta: [{ title: `${findAudiobook(params.slug)?.title ?? "Listen"} — StreamVerse` }, { name: "robots", content: "noindex" }] }),
  component: ListenPage,
});

function ListenPage() {
  const { slug } = Route.useParams();
  const { chapter } = Route.useSearch();
  const cat = useCatalog();
  const apiQuery = useApiAudiobookQuery(slug);

  if (!DEMO_MODE && apiQuery.isLoading) return <div className="h-screen" aria-busy="true" />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const b: Book | undefined = DEMO_MODE
    ? cat.audiobooks.find((x) => x.slug === slug)
    : apiQuery.data
      ? apiBookToLocal(apiQuery.data)
      : undefined;

  return <PlayerGate item={b ? toItem("Audiobook", b) : undefined}>{b && <AudiobookPlayer key={`${b.slug}-${chapter ?? "x"}`} b={b} startChapter={chapter} />}</PlayerGate>;
}
