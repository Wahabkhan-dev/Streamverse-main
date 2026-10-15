import { createFileRoute } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { CollectionCard } from "@/components/sv/media";
import { GeneralError } from "@/components/sv/states";
import { EmptyState } from "@/components/sv/ui";
import { useApiCollectionsQuery } from "@/hooks/useApiCatalog";
import { DEMO_MODE } from "@/lib/config";
import { apiCollectionToLocal } from "@/lib/api-mappers";
import { useCollections } from "@/lib/store";

export const Route = createFileRoute("/_site/collections/")({
  head: () => ({ meta: [{ title: "Collections — StreamVerse" }, { name: "description", content: "Hand-picked collections of movies, eBooks and audiobooks." }] }),
  component: CollectionsPage,
});

function CollectionsPage() {
  const demoCollections = useCollections().filter((c) => c.status === "Published");
  const apiQuery = useApiCollectionsQuery();

  if (!DEMO_MODE && apiQuery.isLoading) return <div className="py-24" aria-busy="true" />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const collections = DEMO_MODE
    ? demoCollections
    : (apiQuery.data ?? []).map(apiCollectionToLocal);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
      <p className="mt-1 text-sm text-muted-foreground">Hand-picked groups of movies, eBooks and audiobooks.</p>
      <div className="py-8">
        {collections.length === 0 ? (
          <EmptyState icon={Layers} title="No collections yet" sub="Curated collections will appear here once they're published." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {collections.map((c) => (
              <li key={c.id}>
                <CollectionCard c={c} fixed={false} />
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
