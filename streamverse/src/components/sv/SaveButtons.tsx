import { Check, Plus } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { useAddToLibraryMutation, useAddToMyListMutation, useApiLibraryQuery, useApiMyListQuery, useRemoveFromLibraryMutation, useRemoveFromMyListMutation } from "@/hooks/useApiMe";
import { DEMO_MODE } from "@/lib/config";
import type { ItemRef } from "@/lib/data";
import { isSaved, toggleLibrary, toggleMyList, useLibrary, useMyList } from "@/lib/user";
import { cn } from "@/lib/utils";
import { Btn } from "./ui";
import type { ApiMixedCard } from "@/api/types";

type Size = "lg" | "md" | "sm";
const API_TYPE = { Movie: "movie", eBook: "ebook", Audiobook: "audiobook" } as const;

/** Live mode: is this title in the server-side list? Matches on the stable content id, falling back to slug. */
const inApiList = (entries: ApiMixedCard[] | undefined, item: ItemRef) =>
  (entries ?? []).some((e) => (item.id ? e.id === item.id : e.slug === item.slug));

/**
 * "My List" toggle. Demo mode keeps it on this device (local store); live mode saves to the account
 * (MySQL) through the API, so it survives a refresh, another browser, and appears on the My List page.
 */
export function MyListButton({ item, size = "lg", className }: { item: ItemRef; size?: Size; className?: string }) {
  const local = useMyList();
  const apiList = useApiMyListQuery();
  const add = useAddToMyListMutation();
  const remove = useRemoveFromMyListMutation();
  const on = DEMO_MODE ? isSaved(local, item) : inApiList(apiList.data, item);
  const pending = add.isPending || remove.isPending;
  // A ref (not state) so a second click in the same tick, before React has re-rendered the disabled button, is ignored too.
  const busy = useRef(false);

  const onClick = () => {
    if (DEMO_MODE) {
      toast.success(toggleMyList(item) ? "Added to My List" : "Removed from My List");
      return;
    }
    if (!item.id) {
      toast.error("This title can't be saved right now.");
      return;
    }
    if (busy.current) return;
    busy.current = true;
    const done = { onError: () => toast.error("Couldn't update My List. Please try again."), onSettled: () => { busy.current = false; } };
    if (on) remove.mutate(item.id, { ...done, onSuccess: () => toast.success("Removed from My List") });
    else add.mutate({ contentId: item.id, contentType: API_TYPE[item.type] }, { ...done, onSuccess: () => toast.success("Added to My List") });
  };

  return (
    <Btn size={size} variant="glass" aria-pressed={on} disabled={pending} className={cn(className)} onClick={onClick}>
      {on ? <Check /> : <Plus />} {on ? "In My List" : "My List"}
    </Btn>
  );
}

export function LibraryButton({ item, size = "lg", className }: { item: ItemRef; size?: Size; className?: string }) {
  const local = useLibrary();
  const apiList = useApiLibraryQuery();
  const add = useAddToLibraryMutation();
  const remove = useRemoveFromLibraryMutation();
  const on = DEMO_MODE ? isSaved(local, item) : inApiList(apiList.data, item);
  const pending = add.isPending || remove.isPending;
  const busy = useRef(false);

  const onClick = () => {
    if (DEMO_MODE) {
      toast.success(toggleLibrary(item) ? "Added to your library" : "Removed from your library");
      return;
    }
    if (!item.id) {
      toast.error("This title can't be saved right now.");
      return;
    }
    if (busy.current) return;
    busy.current = true;
    const done = { onError: () => toast.error("Couldn't update your library. Please try again."), onSettled: () => { busy.current = false; } };
    if (on) remove.mutate(item.id, { ...done, onSuccess: () => toast.success("Removed from your library") });
    else add.mutate({ contentId: item.id, contentType: API_TYPE[item.type] }, { ...done, onSuccess: () => toast.success("Added to your library") });
  };

  return (
    <Btn size={size} variant="glass" aria-pressed={on} disabled={pending} className={cn(className)} onClick={onClick}>
      {on ? <Check /> : <Plus />} {on ? "In Library" : "Add to Library"}
    </Btn>
  );
}
