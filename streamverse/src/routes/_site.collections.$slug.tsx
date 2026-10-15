import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Layers } from "lucide-react";
import { ItemCard } from "@/components/sv/ItemCard";
import { ContentUnavailable, GeneralError } from "@/components/sv/states";
import { EmptyState } from "@/components/sv/ui";
import { useApiCollectionQuery } from "@/hooks/useApiCatalog";
import { DEMO_MODE } from "@/lib/config";
import { apiCollectionToItems, apiCollectionToLocal } from "@/lib/api-mappers";
import { useCatalog, type Item } from "@/lib/items";
import { useCollections } from "@/lib/store";

export const Route = createFileRoute("/_site/collections/$slug")({
  head: () => ({ meta: [{ title: "Collection — StreamVerse" }] }),
  component: CollectionPage,
});

function CollectionPage() {
  const { slug } = Route.useParams();
  const demoCollection = useCollections().find((c) => c.slug === slug && c.status === "Published");
  const cat = useCatalog();
  const apiQuery = useApiCollectionQuery(slug);

  if (!DEMO_MODE && apiQuery.isLoading) return <div className="py-24" aria-busy="true" />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const collection = DEMO_MODE ? demoCollection : apiQuery.data ? apiCollectionToLocal(apiQuery.data) : undefined;
  if (!collection) return <ContentUnavailable message="This collection doesn't exist or isn't published." />;

  const items: Item[] = DEMO_MODE
    ? cat.resolveListed(collection.items)
    : apiQuery.data
      ? apiCollectionToItems(apiQuery.data)
      : [];
  const movies = items.filter((i) => i.type === "Movie");
  const books = items.filter((i) => i.type !== "Movie");

  return (
    <div>
      <section className="relative h-64 overflow-hidden md:h-80">
        <img src={collection.cover} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-hero-x" />
        <div className="absolute inset-0 bg-hero-y" />
        <div className="relative mx-auto flex h-full max-w-[1600px] flex-col justify-end px-4 pb-8 md:px-8">
          <Link to="/collections" className="mb-3 inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-soft hover:text-foreground">
            <ArrowLeft className="size-3.5" /> All collections
          </Link>
          <span className="eyebrow text-primary-text">Collection</span>
          <h1 className="mt-1 text-3xl font-black tracking-tight md:text-5xl">{collection.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-soft">{collection.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">{items.length} {items.length === 1 ? "title" : "titles"}</p>
        </div>
      </section>
      <div className="mx-auto max-w-[1600px] space-y-10 px-4 py-8 md:px-8">
        {items.length === 0 ? (
          <EmptyState icon={Layers} title="Nothing here yet" sub="Titles added to this collection will appear here." />
        ) : (
          <>
            {movies.length > 0 && (
              <section aria-label="Movies">
                <h2 className="mb-3 text-lg font-bold">Movies</h2>
                <div className="grid grid-cols-1 gap-x-3 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
                  {movies.map((i) => (
                    <ItemCard key={i.slug} item={i} fixed={false} />
                  ))}
                </div>
              </section>
            )}
            {books.length > 0 && (
              <section aria-label="Books and audiobooks">
                <h2 className="mb-3 text-lg font-bold">Books &amp; audiobooks</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
                  {books.map((i) => (
                    <ItemCard key={`${i.type}-${i.slug}`} item={i} fixed={false} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
