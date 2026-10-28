import {
  FileText,
  Film,
  Headphones,
  ImageOff,
  Image as ImageIcon,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import type { MediaCategory, MediaListItem } from "@/api/mediaLibrary.api";
import { cn } from "@/lib/utils";

const ICON: Record<MediaCategory, React.ElementType> = {
  images: ImageIcon,
  videos: Film,
  audio: Headphones,
  documents: FileText,
};

/**
 * A card/row thumbnail. Only images with a signed thumbnail URL load a picture (lazily); videos, audio and documents show
 * an icon, so a page of results never downloads a video or an audio file.
 */
export function MediaThumb({
  item,
  className,
}: {
  item: Pick<MediaListItem, "category" | "status" | "thumbnailUrl" | "altText" | "fileName">;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const Icon = ICON[item.category];
  const busy =
    item.status === "UPLOADING" ||
    item.status === "PENDING" ||
    item.status === "UPLOADED" ||
    item.status === "PROCESSING";
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden bg-surface-3 text-muted-foreground",
        className,
      )}
    >
      {item.thumbnailUrl && !broken ? (
        <img
          src={item.thumbnailUrl}
          alt={item.altText || item.fileName || "Media preview"}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : broken ? (
        <ImageOff className="size-6" aria-label="Preview unavailable" />
      ) : busy ? (
        <Loader2 className="size-6 animate-spin" aria-label="Processing" />
      ) : item.status === "FAILED" || item.status === "MISSING" ? (
        <TriangleAlert className="size-6 text-primary-text" aria-label="Problem with this file" />
      ) : (
        <Icon className="size-7" aria-hidden />
      )}
    </div>
  );
}
