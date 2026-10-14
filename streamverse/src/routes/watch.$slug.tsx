import { createFileRoute } from "@tanstack/react-router";
import { MoviePlayer } from "@/components/sv/players/MoviePlayer";
import { PlayerGate } from "@/components/sv/players/PlayerGate";
import { findMovie } from "@/lib/data";
import { toItem, useCatalog } from "@/lib/items";

type Trailer = "official" | "teaser" | "bts";

export const Route = createFileRoute("/watch/$slug")({
  validateSearch: (s: Record<string, unknown>): { trailer?: Trailer } => (s["trailer"] === "official" || s["trailer"] === "teaser" || s["trailer"] === "bts" ? { trailer: s["trailer"] } : {}),
  head: ({ params }) => ({ meta: [{ title: `${findMovie(params.slug)?.title ?? "Watch"} — StreamVerse` }, { name: "robots", content: "noindex" }] }),
  component: WatchPage,
});

function WatchPage() {
  const { slug } = Route.useParams();
  const { trailer } = Route.useSearch();
  const cat = useCatalog();
  const m = cat.movies.find((x) => x.slug === slug);
  return (
    <PlayerGate item={m ? toItem("Movie", m) : undefined}>
      {m && <MoviePlayer key={`${m.slug}-${trailer ?? "film"}`} m={m} trailer={trailer} />}
    </PlayerGate>
  );
}
