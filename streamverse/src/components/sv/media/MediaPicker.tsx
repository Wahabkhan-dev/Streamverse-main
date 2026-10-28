import { Check, FileText, Film, ImageIcon, Music, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { MediaListItem } from "@/api/mediaLibrary.api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMediaListQuery } from "@/hooks/useMediaLibrary";
import { cn } from "@/lib/utils";
import { Btn, EmptyState, Skel, TabBar, TextInput } from "../ui";
import { roleLabel } from "./format";
import { MediaThumb } from "./MediaThumb";
import { UploadPanel } from "./UploadPanel";
import { useUploadQueue } from "./useUploadQueue";

/**
 * What a slot accepts. Mirrors the backend slot rules (which are enforced there too): the picker only offers pictures that
 * fit, and explains why the others are greyed out.
 */
export interface PickerSlot {
  id: string;
  label: string;
  /** specific asset types the slot takes; a generic "library image" is always accepted for artwork slots */
  types: string[];
  minWidth?: number;
  minHeight?: number;
  /** what kind of file; pictures by default. Videos, audio and books can be reused by several titles: they are linked, never copied. */
  category?: "images" | "videos" | "audio" | "documents";
}

export const ARTWORK_SLOTS = {
  moviePoster: {
    id: "moviePoster",
    label: "Movie poster",
    types: ["POSTER"],
    minWidth: 500,
    minHeight: 750,
  },
  movieBackdrop: {
    id: "movieBackdrop",
    label: "Movie backdrop",
    types: ["BACKDROP"],
    minWidth: 1280,
    minHeight: 720,
  },
  movieThumbnail: {
    id: "movieThumbnail",
    label: "Movie thumbnail",
    types: ["THUMBNAIL"],
    minWidth: 320,
    minHeight: 180,
  },
  ebookCover: {
    id: "ebookCover",
    label: "eBook cover",
    types: ["EBOOK_FRONT_COVER"],
    minWidth: 400,
    minHeight: 600,
  },
  audiobookCover: {
    id: "audiobookCover",
    label: "Audiobook cover",
    types: ["AUDIOBOOK_COVER"],
    minWidth: 500,
    minHeight: 500,
  },
  bannerDesktop: {
    id: "bannerDesktop",
    label: "Banner image",
    types: ["NORMAL_BANNER", "HERO_BANNER", "LATEST_RELEASE_BANNER"],
    minWidth: 1200,
    minHeight: 400,
  },
  bannerMobile: {
    id: "bannerMobile",
    label: "Mobile banner",
    types: ["MOBILE_BANNER"],
    minWidth: 750,
    minHeight: 1000,
  },
  collectionImage: {
    id: "collectionImage",
    label: "Collection image",
    types: ["NORMAL_BANNER", "HERO_BANNER"],
    minWidth: 1200,
    minHeight: 400,
  },
} satisfies Record<string, PickerSlot>;

/** Why this picture cannot fill the slot, or null when it fits. */
export function fitProblem(
  item: Pick<MediaListItem, "type" | "status" | "width" | "height">,
  slot: PickerSlot,
): string | null {
  if (item.status !== "READY") return "Still processing";
  const pictures = (slot.category ?? "images") === "images";
  if (!(pictures && item.type === "LIBRARY_IMAGE") && !slot.types.includes(item.type))
    return `${roleLabel(item.type)} cannot be used as a ${slot.label.toLowerCase()}`;
  if (
    slot.minWidth &&
    slot.minHeight &&
    item.width &&
    item.height &&
    (item.width < slot.minWidth || item.height < slot.minHeight)
  ) {
    return `Too small: ${item.width}x${item.height}px, needs ${slot.minWidth}x${slot.minHeight}px`;
  }
  return null;
}

/** The words the picker uses for what it lists, so a trailer slot never talks about "images". */
const NOUN: Record<NonNullable<PickerSlot["category"]>, { one: string; many: string; icon: typeof ImageIcon }> = {
  images: { one: "image", many: "images", icon: ImageIcon },
  videos: { one: "video", many: "videos", icon: Film },
  audio: { one: "audio file", many: "audio files", icon: Music },
  documents: { one: "file", many: "files", icon: FileText },
};

const clock = (s: number) => {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

export function MediaPicker({
  open,
  onOpenChange,
  slot,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slot: PickerSlot;
  onSelect: (item: MediaListItem) => void;
}) {
  const [tab, setTab] = useState<"library" | "upload">("library");
  const pictures = (slot.category ?? "images") === "images";
  const noun = NOUN[slot.category ?? "images"];
  // e.g. "trailer videos": the kind of file this slot takes, used in the search box and the empty message
  const kind = pictures ? noun.many : `${slot.types.map((t) => roleLabel(t).toLowerCase()).join(" / ")} ${noun.many}`;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<MediaListItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (open) {
      setTab("library");
      setChosen(null);
    }
  }, [open]);

  const params = useMemo(
    () => ({
      page,
      limit: 18,
      category: slot.category ?? ("images" as const),
      sort: "newest" as const,
      // a file already used by another title can be chosen too: it is linked, so the same stored file serves both
      ...((slot.category ?? "images") !== "images" && slot.types.length === 1
        ? { assetRole: slot.types[0]! }
        : {}),
      ...(debounced ? { search: debounced } : {}),
    }),
    [page, debounced, slot],
  );
  const query = useMediaListQuery(params, { enabled: open });
  const items = query.data?.data ?? [];
  const meta = query.data?.meta;

  const queue = useUploadQueue((assetId) => {
    // a fresh upload is a library image; refresh the grid and show it
    void query.refetch().then(() => setTab("library"));
    toast.success("Uploaded. Select it to use it.");
    setSearch("");
    void assetId;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto border-border bg-surface-2"
        data-testid="media-picker"
      >
        <DialogHeader>
          <DialogTitle>{slot.label}</DialogTitle>
          <DialogDescription>
            {(slot.category ?? "images") === "images"
              ? "Choose a picture from the Media Library or upload a new one."
              : "Choose a file that is already in the Media Library. It is linked, not copied, so using it again takes no extra storage."}
            {slot.minWidth ? ` Needs at least ${slot.minWidth}x${slot.minHeight}px.` : ""}
          </DialogDescription>
        </DialogHeader>
        {(slot.category ?? "images") === "images" && (
          <TabBar
            tabs={[
              { id: "library", label: "Choose from Media Library" },
              { id: "upload", label: "Upload New" },
            ]}
            value={tab}
            onChange={setTab}
            label="Picker source"
          />
        )}
        {tab === "upload" ? (
          <UploadPanel queue={queue} imagesOnly />
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${noun.many} by name, title or content`}
                aria-label={`Search ${noun.many}`}
                className="pl-9"
              />
            </div>
            {query.isError ? (
              <EmptyState
                title="Could not load the Media Library"
                sub="Check your connection and try again."
                action={<Btn onClick={() => void query.refetch()}>Retry</Btn>}
              />
            ) : query.isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skel key={i} className="aspect-[4/3]" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={noun.icon}
                title={debounced ? `No ${kind} match your search` : `No ${kind} in the Media Library yet`}
                sub={
                  pictures
                    ? "Use Upload New to add one."
                    : `Close this and use the upload box in this step to add one. Only ${kind} are listed here, because only they can fill this slot.`
                }
              />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={noun.many[0]!.toUpperCase() + noun.many.slice(1)}>
                {items.map((it) => {
                  const problem = fitProblem(it, slot);
                  const selected = chosen?.id === it.id;
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        disabled={!!problem}
                        onClick={() => setChosen(it)}
                        data-testid="picker-item"
                        aria-pressed={selected}
                        title={problem ?? it.displayTitle ?? it.fileName ?? undefined}
                        className={cn(
                          "group relative block w-full overflow-hidden rounded-lg border text-left transition-colors",
                          selected
                            ? "border-primary ring-2 ring-primary"
                            : "border-border hover:border-foreground/30",
                          problem && "opacity-40",
                        )}
                      >
                        <MediaThumb item={it} className="aspect-[4/3] w-full" />
                        {selected && (
                          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-4" />
                          </span>
                        )}
                        <span className="block truncate px-2 py-1.5 text-xs">
                          {it.displayTitle || it.fileName}
                        </span>
                        <span className="block truncate px-2 pb-1.5 text-[10px] text-muted-foreground">
                          {problem ??
                            (pictures
                              ? `${it.width ?? "?"}x${it.height ?? "?"} · ${roleLabel(it.type)}`
                              : [roleLabel(it.type), it.durationSeconds ? clock(it.durationSeconds) : null].filter(Boolean).join(" · "))}
                        </span>
                        {it.usageCount > 0 && (slot.category ?? "images") !== "images" && (
                          <span className="block truncate px-2 pb-1.5 text-[10px] font-medium text-primary-text" data-testid="picker-shared-note">
                            Already used by {it.usageCount} {it.usageCount === 1 ? "title" : "titles"}: it will be shared, not copied
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {meta && (meta.totalPages ?? 1) > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Btn size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Btn>
                <span>
                  Page {meta.page} of {meta.totalPages}
                </span>
                <Btn
                  size="sm"
                  disabled={page >= (meta.totalPages ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Btn>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Btn onClick={() => onOpenChange(false)}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={!chosen}
            data-testid="picker-confirm"
            onClick={() => {
              if (!chosen) return;
              onSelect(chosen);
              onOpenChange(false);
            }}
          >
            Use this {noun.one}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}
