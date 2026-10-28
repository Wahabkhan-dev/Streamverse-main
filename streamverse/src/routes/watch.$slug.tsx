import { AuthGate } from "@/components/sv/AuthGate";
import { createFileRoute } from "@tanstack/react-router";
import { MoviePlayer } from "@/components/sv/players/MoviePlayer";
import { PlayerGate } from "@/components/sv/players/PlayerGate";
import { GeneralError } from "@/components/sv/states";
import { useApiMovieQuery } from "@/hooks/useApiCatalog";
import { apiMovieToLocal } from "@/lib/api-mappers";
import { DEMO_MODE } from "@/lib/config";
import { findMovie, type Movie } from "@/lib/data";
import { toItem, useCatalog } from "@/lib/items";

type Trailer = "official" | "teaser" | "bts";

export const Route = createFileRoute("/watch/$slug")({
  validateSearch: (s: Record<string, unknown>): { trailer?: Trailer } => (s["trailer"] === "official" || s["trailer"] === "teaser" || s["trailer"] === "bts" ? { trailer: s["trailer"] } : {}),
  head: ({ params }) => ({ meta: [{ title: `${findMovie(params.slug)?.title ?? "Watch"} — StreamVerse` }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AuthGate fullScreen>
      <WatchPage />
    </AuthGate>
  ),
});

function WatchPage() {
  const { slug } = Route.useParams();
  const { trailer } = Route.useSearch();
  const cat = useCatalog();
  const apiQuery = useApiMovieQuery(slug);

  // Live mode resolves the title from the API, exactly like the detail page. The local catalog only holds demo
  // titles, so using it here made every real uploaded movie show "This title is unavailable".
  if (!DEMO_MODE && apiQuery.isLoading) return <div className="h-screen" aria-busy="true" />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const m: Movie | undefined = DEMO_MODE ? cat.movies.find((x) => x.slug === slug) : apiQuery.data ? apiMovieToLocal(apiQuery.data) : undefined;
  return (
    <PlayerGate item={m ? toItem("Movie", m) : undefined}>
      {m && <MoviePlayer key={`${m.slug}-${trailer ?? "film"}`} m={m} trailer={trailer} />}
    </PlayerGate>
  );
}
