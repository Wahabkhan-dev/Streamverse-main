import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AudiobookCard, useFakeLoad } from "@/components/sv/media";
import { FilterPills, EmptyState, Skel } from "@/components/sv/ui";
import { useCatalog } from "@/lib/items";
import { useGenreNames } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { useApiAudiobooksQuery } from "@/hooks/useApiCatalog";
import { apiBookToLocal } from "@/lib/api-mappers";

export const Route = createFileRoute("/_site/audiobooks/")({
  head: () => ({
    meta: [
      { title: "Audiobooks — StreamVerse" },
      { name: "description", content: "Listen to bestselling audiobooks narrated by top voices on StreamVerse." },
      { property: "og:title", content: "Audiobooks — StreamVerse" },
      { property: "og:description", content: "Bestselling audiobooks, ready to listen anywhere." },
    ],
  }),
  component: Page,
});


function Page() {
  const [g, setG] = useState("All");

  // Demo-mode catalog (always call hooks)
  const cat = useCatalog();
  const bookGenres = useGenreNames("Audiobook");
  const loading = useFakeLoad();

  // API-mode data (enabled: !DEMO_MODE internally)
  const apiAudiobooksQuery = useApiAudiobooksQuery({ page: 1, limit: 100 });

  // Derived data (all useMemo before any early returns)
  const apiAudiobooks = useMemo(
    () => (DEMO_MODE ? [] : (apiAudiobooksQuery.data?.data ?? []).map(apiBookToLocal)),
    [apiAudiobooksQuery.data],
  );

  const list_ = DEMO_MODE ? cat.listedAudiobooks : apiAudiobooks;

  const genreOptions = useMemo(() => {
    if (DEMO_MODE) return bookGenres;
    const seen = new Set<string>();
    for (const b of apiAudiobooks) seen.add(b.genre);
    return ["All", ...Array.from(seen).sort()];
  }, [DEMO_MODE, bookGenres, apiAudiobooks]);

  // Loading / error states (after all hooks)
  if (!DEMO_MODE && apiAudiobooksQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
        <Skel className="h-8 w-40" />
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-7">
          {Array.from({ length: 12 }, (_, i) => <Skel key={i} className="aspect-square" />)}
        </div>
      </div>
    );
  }
  if (!DEMO_MODE && apiAudiobooksQuery.isError) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">Audiobooks</h1>
        <p className="mt-6 text-sm text-muted-foreground">Failed to load audiobooks. Please refresh and try again.</p>
      </div>
    );
  }

  const list = list_.filter((b) => g === "All" || b.genre === g);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Audiobooks</h1>
      <div className="mt-5">
        <FilterPills items={genreOptions} value={g} onChange={setG} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-7">
        {DEMO_MODE && loading
          ? Array.from({ length: 12 }, (_, i) => <Skel key={i} className="aspect-square" />)
          : list.map((b) => <AudiobookCard key={b.slug} b={b} fixed={false} />)}
      </div>
      {!(DEMO_MODE && loading) && list.length === 0 && <EmptyState title={`No ${g} audiobooks yet`} sub="New titles are added every week." />}
    </div>
  );
}
