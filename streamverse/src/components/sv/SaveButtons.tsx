import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import type { ItemRef } from "@/lib/data";
import { isSaved, toggleLibrary, toggleMyList, useLibrary, useMyList } from "@/lib/user";
import { cn } from "@/lib/utils";
import { Btn } from "./ui";

/** "My List" toggle. Saved on this device for now, so it shows up on the My List page. */
export function MyListButton({ item, size = "lg", className }: { item: ItemRef; size?: "lg" | "md" | "sm"; className?: string }) {
  const list = useMyList();
  const on = isSaved(list, item);
  return (
    <Btn
      size={size}
      variant="glass"
      aria-pressed={on}
      className={cn(className)}
      onClick={() => {
        const added = toggleMyList(item);
        toast.success(added ? "Added to My List" : "Removed from My List");
      }}
    >
      {on ? <Check /> : <Plus />} {on ? "In My List" : "My List"}
    </Btn>
  );
}

export function LibraryButton({ item, size = "lg", className }: { item: ItemRef; size?: "lg" | "md" | "sm"; className?: string }) {
  const list = useLibrary();
  const on = isSaved(list, item);
  return (
    <Btn
      size={size}
      variant="glass"
      aria-pressed={on}
      className={cn(className)}
      onClick={() => {
        const added = toggleLibrary(item);
        toast.success(added ? "Added to your library" : "Removed from your library");
      }}
    >
      {on ? <Check /> : <Plus />} {on ? "In Library" : "Add to Library"}
    </Btn>
  );
}
