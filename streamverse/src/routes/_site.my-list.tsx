import { createFileRoute, Link } from "@tanstack/react-router";
import { ListPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ItemCard } from "@/components/sv/ItemCard";
import { EmptyState, Skel, TabBar } from "@/components/sv/ui";
import { useFakeLoad } from "@/components/sv/media";
import { itemTitle, useCatalog, toItem, type Item } from "@/lib/items";
import { refKey, toggleMyList, useMyList } from "@/lib/user";
import { UnavailableContent } from "@/components/sv/UnavailableContent";
import { DEMO_MODE } from "@/lib/config";
import { useApiMyListQuery, useRemoveFromMyListMutation } from "@/hooks/useApiMe";
import type { Movie, Book, ItemRef, Status } from "@/lib/data";
import { mixedCardToItem } from "@/lib/api-mappers";

type Tab = "all" | "movies" | "ebooks" | "audiobooks";

export const Route = createFileRoute("/_site/my-list")({
  head: () => ({
    meta: [
      { title: "My List — StreamVerse" },
      { name: "description", content: "Movies, eBooks and audiobooks you've saved for later." },
      { property: "og:title", content: "My List — StreamVerse" },
      { property: "og:description", content: "Everything you've saved on StreamVerse." },
    ],
  }),
  component: MyList,
});

const typeOf = { movies: "Movie", ebooks: "eBook", audiobooks: "Audiobook" } as const;

function MyList() {
  const [tab, setTab] = useState<Tab>("all");

  // Demo-mode data (always call hooks)
  const demoList = useMyList();
  const cat = useCatalog();
  const loading = useFakeLoad(300);

  // API-mode data
  const apiMyListQuery = useApiMyListQuery();
  const removeFromMyListMutation = useRemoveFromMyListMutation();

  // Build the items list
  const items: Item[] = useMemo(() => {
    if (DEMO_MODE) return cat.resolveListed(demoList);
    return (apiMyListQuery.data ?? [])
      .map(mixedCardToItem)
      .filter((i): i is Item => i !== null);
  }, [DEMO_MODE, demoList, cat, apiMyListQuery.data]);

  // In API mode, "unavailable" items are those in the list without embedded content
  const unavailable: ItemRef[] = useMemo(() => {
    if (DEMO_MODE) return demoList.filter((r) => !items.some((i) => refKey(i) === refKey(r)));
    return [];
  }, [DEMO_MODE, demoList, items]);

  // Loading / error states (after all hooks)
  if (!DEMO_MODE && apiMyListQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
        <Skel className="h-8 w-32" />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skel key={i} className="aspect-[2/3]" />)}
        </div>
      </div>
    );
  }
  if (!DEMO_MODE && apiMyListQuery.isError) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">My List</h1>
        <p className="mt-6 text-sm text-muted-foreground">Failed to load your list. Please refresh and try again.</p>
      </div>
    );
  }

  const shown = tab === "all" ? items : items.filter((i) => i.type === typeOf[tab]);
  const count = (t: "Movie" | "eBook" | "Audiobook") => items.filter((i) => i.type === t).length;

  const handleRemove = (i: Item, apiItemId?: string) => {
    if (!DEMO_MODE) {
      // Find the API list entry for this item (its `id` is the content id)
      const entry = (apiMyListQuery.data ?? []).find((e) => e.slug === i.slug);
      if (entry) {
        removeFromMyListMutation.mutate(entry.id, {
          onSuccess: () => toast.success("Removed from My List"),
          onError: () => toast.error("Failed to remove from My List"),
        });
      }
      return;
    }
    toggleMyList(i);
    toast.success("Removed from My List");
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-8 md:px-8">
      <h1 className="text-3xl font-bold tracking-tight">My List</h1>
      <p className="mt-1 text-sm text-muted-foreground">Titles you've saved to come back to.</p>
      <div className="mt-6">
        <TabBar
          label="My List"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "all", label: "All", count: items.length },
            { id: "movies", label: "Movies", count: count("Movie") },
            { id: "ebooks", label: "eBooks", count: count("eBook") },
            { id: "audiobooks", label: "Audiobooks", count: count("Audiobook") },
          ]}
        />
      </div>
      <div className="py-8">
        {DEMO_MODE && loading ? (
          <div aria-busy="true" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skel key={i} className="aspect-[2/3]" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title={items.length === 0 ? "Your list is empty" : `No ${tab} in your list`}
            sub="Use the My List button on any movie, eBook or audiobook to save it here."
            action={
              <Link to="/" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
                Browse StreamVerse
              </Link>
            }
          />
        ) : (
          <ul className={tab === "movies" ? "grid grid-cols-1 gap-x-3 gap-y-6 sm:grid-cols-2 lg:grid-cols-4" : "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5"}>
            {shown.map((i) => (
              <li key={`${i.type}-${i.slug}`} className="group/item relative">
                <ItemCard item={i} fixed={false} />
                <button
                  type="button"
                  aria-label={`Remove ${itemTitle(i)} from My List`}
                  title="Remove from My List"
                  onClick={() => handleRemove(i)}
                  className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-ink/80 text-soft opacity-100 backdrop-blur transition-opacity hover:bg-primary hover:text-foreground md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {DEMO_MODE && (
          <UnavailableContent
            refs={unavailable}
            where="My List"
            onRemove={(r) => {
              toggleMyList(r);
              toast.success("Removed from My List");
            }}
          />
        )}
      </div>
    </div>
  );
}
