import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MovieCard, MediaRow, useFakeLoad } from "@/components/sv/media";
import { FilterPills, EmptyState, Skel, Btn } from "@/components/sv/ui";
import { useCatalog } from "@/lib/items";
import { useGenreNames } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { useApiMoviesQuery } from "@/hooks/useApiCatalog";
import { apiMovieToLocal } from "@/lib/api-mappers";

export const Route = createFileRoute("/_site/movies/")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s["q"] === "string" ? { q: s["q"] } : {}),
  head: () => ({
    meta: [
      { title: "Movies — StreamVerse" },
      { name: "description", content: "Browse trending, popular and latest movies in 4K HDR on StreamVerse." },
      { property: "og:title", content: "Movies — StreamVerse" },
      { property: "og:description", content: "Browse trending, popular and latest movies on StreamVerse." },
    ],
  }),
  component: MoviesPage,
});


function MoviesPage() {
  const { q } = Route.useSearch();
  const [g, setG] = useState("All");

  // Demo-mode catalog (always call hooks)
  const cat = useCatalog();
  const movieGenres = useGenreNames("Movie");
  const loading = useFakeLoad();

  // API-mode data (enabled: !DEMO_MODE internally)
  const apiMoviesQuery = useApiMoviesQuery({ page: 1, limit: 100 });

  // Derived data (all useMemo before any early returns)
  const apiMovies = useMemo(
    () => (DEMO_MODE ? [] : (apiMoviesQuery.data?.data ?? []).map(apiMovieToLocal)),
    [apiMoviesQuery.data],
  );

  const pub = DEMO_MODE ? cat.listedMovies : apiMovies;

  const genreOptions = useMemo(() => {
    if (DEMO_MODE) return movieGenres;
    const seen = new Set<string>();
    for (const m of apiMovies) for (const genre of m.genres) seen.add(genre);
    return ["All", ...Array.from(seen).sort()];
  }, [DEMO_MODE, movieGenres, apiMovies]);

  // Loading / error states (after all hooks)
  if (!DEMO_MODE && apiMoviesQuery.isLoading) {
    return (
      <div className="pt-8">
        <div className="mx-auto max-w-[1600px] px-4 md:px-8">
          <Skel className="h-8 w-32" />
          <div className="mt-6 grid grid-cols-1 gap-x-3 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i}><Skel className="aspect-video" /><Skel className="mt-2 h-4 w-2/3" /></div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!DEMO_MODE && apiMoviesQuery.isError) {
    return (
      <div className="pt-8">
        <div className="mx-auto max-w-[1600px] px-4 md:px-8">
          <h1 className="text-3xl font-bold tracking-tight">Movies</h1>
          <p className="mt-6 text-sm text-muted-foreground">Failed to load movies. Please refresh and try again.</p>
        </div>
      </div>
    );
  }

  const list = pub.filter((m) => (g === "All" || m.genres.includes(g)) && (!q || m.title.toLowerCase().includes(q.toLowerCase())));
  const byGenre = (x: string) => pub.filter((m) => m.genres.includes(x));

  return (
    <div className="pt-8">
      <div className="mx-auto max-w-[1600px] px-4 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">Movies</h1>
        {q && <p className="mt-1 text-sm text-muted-foreground">Results for "{q}"</p>}
        <div className="mt-5">
          <FilterPills items={genreOptions} value={g} onChange={setG} />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-x-3 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {DEMO_MODE && loading
            ? Array.from({ length: 8 }, (_, i) => (
                <div key={i}>
                  <Skel className="aspect-video" />
                  <Skel className="mt-2 h-4 w-2/3" />
                </div>
              ))
            : list.map((m) => <MovieCard key={m.slug} m={m} wide={false} />)}
        </div>
        {!(DEMO_MODE && loading) && list.length === 0 && (
          <EmptyState title="No movies found" sub="Try a different genre or search." action={<Btn onClick={() => setG("All")}>Reset filters</Btn>} />
        )}
      </div>
      {g === "All" && !q && (
        <div className="mt-12 space-y-10">
          <MediaRow title="Trending">{[...pub].sort((a, b) => b.views - a.views).map((m) => <MovieCard key={m.slug} m={m} />)}</MediaRow>
          <MediaRow title="Popular">{pub.slice(2).concat(pub.slice(0, 2)).map((m) => <MovieCard key={m.slug} m={m} />)}</MediaRow>
          {["Action", "Drama", "Sci-Fi"].map((x) => (
            <MediaRow key={x} title={x}>
              {byGenre(x).map((m) => <MovieCard key={m.slug} m={m} />)}
            </MediaRow>
          ))}
        </div>
      )}
    </div>
  );
}
