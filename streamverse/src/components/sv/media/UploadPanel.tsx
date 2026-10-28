import { CheckCircle2, CircleAlert, Loader2, RotateCcw, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import type { UploadStage } from "@/api/mediaLibrary.api";
import { Btn } from "../ui";
import { cn } from "@/lib/utils";
import { fmtBytes } from "./format";
import { useUploadQueue } from "./useUploadQueue";

export const STAGE_LABEL: Record<UploadStage, string> = {
  queued: "Waiting",
  preparing: "Preparing",
  uploading: "Uploading",
  verifying: "Verifying",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

const ACCEPT = ".jpg,.jpeg,.png,.webp,.mp4,.mov,.mkv,.mp3,.m4a,.aac,.wav,.epub,.pdf";

/**
 * Drag-and-drop / file-picker upload surface with a per-file queue. Used by the Upload dialog and by the MediaPicker's
 * "Upload New" tab (which restricts it to images with `imagesOnly`).
 */
export function UploadPanel({
  queue,
  imagesOnly,
  single,
}: {
  queue: ReturnType<typeof useUploadQueue>;
  imagesOnly?: boolean;
  single?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const accept = imagesOnly ? ".jpg,.jpeg,.png,.webp" : ACCEPT;
  const take = (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []);
    if (list.length) queue.add(single ? list.slice(0, 1) : list);
  };
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          over ? "border-primary bg-primary/5" : "border-border bg-surface-2",
        )}
      >
        <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm font-semibold">
          {single ? "Drop a file here" : "Drop files here"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {imagesOnly
            ? "JPG, PNG or WebP up to 15 MB"
            : "Images, video, audio, EPUB and PDF. Large files upload in parts."}
        </p>
        <Btn className="mt-3" size="sm" onClick={() => input.current?.click()}>
          Choose {single ? "file" : "files"}
        </Btn>
        <input
          ref={input}
          type="file"
          hidden
          multiple={!single}
          accept={accept}
          data-testid="media-file-input"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queue.items.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {queue.items.length} file{queue.items.length === 1 ? "" : "s"} · overall{" "}
              {Math.round(queue.overall * 100)}%
            </span>
            <button
              type="button"
              className="font-semibold text-soft hover:text-foreground"
              onClick={queue.clearFinished}
            >
              Clear finished
            </button>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label="Overall upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(queue.overall * 100)}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.round(queue.overall * 100)}%` }}
            />
          </div>
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {queue.items.map((u) => {
              const live = ["preparing", "uploading", "verifying", "processing"].includes(u.stage);
              return (
                <li
                  key={u.key}
                  data-testid="upload-row"
                  data-stage={u.stage}
                  className="rounded-lg border border-border bg-surface-2 p-3"
                >
                  <div className="flex items-center gap-3">
                    {u.stage === "ready" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    ) : u.stage === "failed" ? (
                      <CircleAlert className="size-4 shrink-0 text-primary-text" />
                    ) : live ? (
                      <Loader2 className="size-4 shrink-0 animate-spin" />
                    ) : (
                      <UploadCloud className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.file.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtBytes(u.file.size)} · {STAGE_LABEL[u.stage]}
                        {u.stage === "uploading" ? ` ${Math.round(u.progress * 100)}%` : ""}
                      </div>
                    </div>
                    {u.stage === "failed" && (
                      <Btn
                        size="sm"
                        onClick={() => queue.retry(u.key)}
                        aria-label={`Retry ${u.file.name}`}
                      >
                        <RotateCcw /> Retry
                      </Btn>
                    )}
                    {(live || u.stage === "queued") && (
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => queue.cancel(u.key)}
                        aria-label={`Cancel ${u.file.name}`}
                      >
                        Cancel
                      </Btn>
                    )}
                    {(u.stage === "failed" || u.stage === "cancelled" || u.stage === "ready") && (
                      <Btn
                        size="icon"
                        variant="ghost"
                        onClick={() => queue.remove(u.key)}
                        aria-label={`Dismiss ${u.file.name}`}
                      >
                        <X />
                      </Btn>
                    )}
                  </div>
                  {(u.stage === "uploading" || u.stage === "verifying") && (
                    <div
                      className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"
                      role="progressbar"
                      aria-label={`${u.file.name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(u.progress * 100)}
                    >
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.round(u.progress * 100)}%` }}
                      />
                    </div>
                  )}
                  {u.error && <p className="mt-2 text-xs text-primary-text">{u.error}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
