import { ImageIcon, Library } from "lucide-react";
import { useState } from "react";
import { useMediaDetailQuery } from "@/hooks/useMediaLibrary";
import { Btn, Skel } from "../ui";
import { roleLabel } from "./format";
import { MediaPicker, type PickerSlot } from "./MediaPicker";

/**
 * One artwork slot (poster, cover, banner...) with "Select From Media Library". Choosing a picture only stores its id: the
 * file is never copied, so many titles can share one stored object and the library keeps counting where it is used.
 */
export function ArtworkField({
  slot,
  assetId,
  onChange,
  onRemove,
  hint,
}: {
  slot: PickerSlot;
  assetId: string | undefined | null;
  onChange: (assetId: string) => void;
  onRemove?: () => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const detail = useMediaDetailQuery(assetId ?? undefined);
  const d = detail.data?.data;
  return (
    <div
      className="rounded-lg border border-border bg-surface p-3"
      data-testid={`artwork-${slot.id}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-soft">{slot.label}</span>
        <span className="text-muted-foreground">
          {hint ?? (slot.minWidth ? `min ${slot.minWidth}x${slot.minHeight}` : "")}
        </span>
      </div>
      <div className="relative grid aspect-[16/9] place-items-center overflow-hidden rounded-md border border-border bg-surface-2">
        {assetId && detail.isLoading ? (
          <Skel className="absolute inset-0" />
        ) : d?.previewUrl ? (
          <img
            src={d.previewUrl}
            alt={d.altText || d.displayTitle || `${slot.label} preview`}
            className="absolute inset-0 size-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <ImageIcon className="size-6" />
            {assetId ? "Preview unavailable" : "No image selected"}
          </div>
        )}
      </div>
      {d && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground" data-testid="artwork-name">
          {d.displayTitle || d.fileName} · {roleLabel(d.type)}
          {d.width && d.height ? ` · ${d.width}x${d.height}` : ""}
        </p>
      )}
      <Btn
        className="mt-2 w-full"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid={`select-${slot.id}`}
      >
        <Library /> {assetId ? "Change from Media Library" : "Select From Media Library"}
      </Btn>
      {assetId && onRemove && (
        <Btn
          className="mt-1 w-full"
          size="sm"
          variant="ghost"
          onClick={onRemove}
          data-testid={`remove-${slot.id}`}
        >
          Remove image
        </Btn>
      )}
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        slot={slot}
        onSelect={(item) => onChange(item.id)}
      />
    </div>
  );
}
