import { createFileRoute } from "@tanstack/react-router";
import { useGenreNames } from "@/hooks/useGenreNames";
import { useMemo, useState } from "react";
import { BookCard, useFakeLoad } from "@/components/sv/media";
import { FilterPills, EmptyState, Skel } from "@/components/sv/ui";
import { useCatalog } from "@/lib/items";

import { DEMO_MODE } from "@/lib/config";
import { SubpageHero } from "@/components/sv/SubpageHero";
import { useApiEbooksQuery } from "@/hooks/useApiCatalog";
import { apiBookToLocal } from "@/lib/api-mappers";

export const Route = createFileRoute("/_site/ebooks/")({
  head: () => ({
    meta: [
      { title: "eBooks — StreamVerse" },
      {
        name: "description",
        content: "Read fiction, business, biography and more eBooks on StreamVerse.",
      },
      { property: "og:title", content: "eBooks — StreamVerse" },
      { property: "og:description", content: "Thousands of eBooks to read on any device." },
    ],
  }),
  component: Page,
});

function Page() {
  const [g, setG] = useState("All");

  // Demo-mode catalog (always call hooks)
  const cat = useCatalog();
  const bookGenres = useGenreNames("eBook");
  const loading = useFakeLoad();

  // API-mode data (enabled: !DEMO_MODE internally)
  const apiEbooksQuery = useApiEbooksQuery({ page: 1, limit: 100 });

  // Derived data (all useMemo before any early returns)
  const apiEbooks = useMemo(
    () => (DEMO_MODE ? [] : (apiEbooksQuery.data?.data ?? []).map(apiBookToLocal)),
    [apiEbooksQuery.data],
  );

  const list_ = DEMO_MODE ? cat.listedEbooks : apiEbooks;

  const genreOptions = useMemo(() => {
    if (DEMO_MODE) return bookGenres;
    const seen = new Set<string>();
    for (const b of apiEbooks) seen.add(b.genre);
    return ["All", ...Array.from(seen).sort()];
  }, [DEMO_MODE, bookGenres, apiEbooks]);

  // Loading / error states (after all hooks)
  if (!DEMO_MODE && apiEbooksQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
        <Skel className="h-8 w-32" />
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {Array.from({ length: 12 }, (_, i) => (
            <Skel key={i} className="aspect-[2/3]" />
          ))}
        </div>
      </div>
    );
  }
  if (!DEMO_MODE && apiEbooksQuery.isError) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">eBooks</h1>
        <p className="mt-6 text-sm text-muted-foreground">
          Failed to load eBooks. Please refresh and try again.
        </p>
      </div>
    );
  }

  const list = list_.filter((b) => g === "All" || b.genre === g);

  return (
    <>
      <SubpageHero placement="EBOOKS" />
      <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">eBooks</h1>
        <div className="mt-5">
          <FilterPills items={genreOptions} value={g} onChange={setG} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {DEMO_MODE && loading
            ? Array.from({ length: 12 }, (_, i) => <Skel key={i} className="aspect-[2/3]" />)
            : list.map((b) => <BookCard key={b.slug} b={b} fixed={false} />)}
        </div>
        {!(DEMO_MODE && loading) && list.length === 0 && (
          <EmptyState title={`No ${g} eBooks yet`} sub="New titles are added every week." />
        )}
      </div>
    </>
  );
}
