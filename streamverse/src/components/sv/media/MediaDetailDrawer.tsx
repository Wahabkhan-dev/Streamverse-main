import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink, Lock, RefreshCw, Replace, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { MediaDetail } from "@/api/mediaLibrary.api";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaDetailQuery, useMediaMutations } from "@/hooks/useMediaLibrary";
import { isApiError } from "@/api/client";
import { Btn, ConfirmDialog, Field, Skel, StatusBadge, TextArea, TextInput } from "../ui";
import { fmtBytes, fmtDuration, roleLabel, STATUS_LABEL } from "./format";
import { ProcessingBar } from "./ProcessingBar";
import { UploadPanel } from "./UploadPanel";
import { useUploadQueue } from "./useUploadQueue";

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "-" : String(v));

function Preview({ d }: { d: MediaDetail }) {
  if (!d.previewUrl) {
    return (
      <div className="grid aspect-video place-items-center rounded-lg border border-border bg-surface-3 text-sm text-muted-foreground">
        {d.status === "READY" ? "No preview available" : `${STATUS_LABEL[d.status]}…`}
      </div>
    );
  }
  // protected media is previewed only through a short-lived link that is generated now and never stored
  if (d.previewKind === "image")
    return (
      <img
        src={d.previewUrl}
        alt={d.altText || d.fileName || "Preview"}
        className="max-h-72 w-full rounded-lg border border-border bg-surface-3 object-contain"
      />
    );
  if (d.previewKind === "video")
    return (
      <video
        src={d.previewUrl}
        controls
        preload="metadata"
        className="max-h-72 w-full rounded-lg border border-border bg-black"
      />
    );
  if (d.previewKind === "audio")
    return <audio src={d.previewUrl} controls preload="metadata" className="w-full" />;
  return (
    <a
      href={d.previewUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm font-semibold text-primary-text hover:underline"
    >
      <ExternalLink className="size-4" /> Open {d.previewKind === "pdf" ? "PDF" : "file"} (link
      expires in {Math.round((d.previewExpiresInSeconds ?? 0) / 60)} min)
    </a>
  );
}

export function MediaDetailDrawer({
  id,
  onClose,
}: {
  id: string | undefined;
  onClose: () => void;
}) {
  const query = useMediaDetailQuery(id);
  const d = query.data?.data;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="w-full overflow-y-auto border-border bg-surface-2 sm:max-w-lg"
        data-testid="media-drawer"
      >
        <SheetHeader>
          <SheetTitle className="break-words pr-6">
            {d ? d.displayTitle || d.fileName || "Media file" : "Media file"}
          </SheetTitle>
          <SheetDescription>
            {d ? `${roleLabel(d.type)} · ${STATUS_LABEL[d.status]}` : "Loading details"}
          </SheetDescription>
        </SheetHeader>
        {query.isError ? (
          <div className="mt-6 rounded-lg border border-border p-4 text-sm">
            This file could not be loaded. It may have been deleted.
            <div className="mt-3 flex gap-2">
              <Btn size="sm" onClick={() => void query.refetch()}>
                Retry
              </Btn>
              <Btn size="sm" onClick={onClose}>
                Close
              </Btn>
            </div>
          </div>
        ) : !d ? (
          <div className="mt-6 space-y-3">
            <Skel className="aspect-video w-full" />
            <Skel className="h-6 w-2/3" />
            <Skel className="h-24 w-full" />
          </div>
        ) : (
          <DrawerBody key={d.id} d={d} onGone={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ d, onGone }: { d: MediaDetail; onGone: () => void }) {
  const { update, remove, replace, retryProcessing } = useMediaMutations();
  const [form, setForm] = useState({
    displayTitle: d.displayTitle ?? "",
    altText: d.altText ?? "",
    caption: d.caption ?? "",
    notes: d.notes ?? "",
    folder: d.folder ?? "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const dirty =
    form.displayTitle !== (d.displayTitle ?? "") ||
    form.altText !== (d.altText ?? "") ||
    form.caption !== (d.caption ?? "") ||
    form.notes !== (d.notes ?? "") ||
    form.folder !== (d.folder ?? "");
  const used = d.usedBy.length > 0;
  const replaceTarget = useRef(d.id);
  replaceTarget.current = d.id;

  const queue = useUploadQueue((newId) => {
    replace.mutate(
      { id: replaceTarget.current, newAssetId: newId },
      {
        onSuccess: (r) => {
          toast.success(
            `Replaced. ${r.data.referencesMoved} place${r.data.referencesMoved === 1 ? "" : "s"} now use the new file.`,
          );
          onGone();
        },
        onError: (e) => toast.error(isApiError(e) ? e.message : "Replace failed"),
      },
    );
  });

  useEffect(() => setShowReplace(false), [d.id]);

  const save = () =>
    update.mutate(
      {
        id: d.id,
        patch: {
          displayTitle: form.displayTitle || null,
          altText: form.altText || null,
          caption: form.caption || null,
          notes: form.notes || null,
          folder: form.folder || null,
        },
      },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (e) => toast.error(isApiError(e) ? e.message : "Could not save"),
      },
    );

  const del = () =>
    remove.mutate(d.id, {
      onSuccess: () => {
        toast.success("File deleted");
        onGone();
      },
      onError: (e) => toast.error(isApiError(e) ? e.message : "Delete failed"),
    });

  const rows: Array<[string, string]> = [
    ["File name", dash(d.fileName)],
    ["Type", `${roleLabel(d.type)} (${dash(d.mimeType)})`],
    ["Size", fmtBytes(d.sizeBytes)],
    ["Dimensions", d.width && d.height ? `${d.width} x ${d.height}px` : "-"],
    ["Duration", d.durationSeconds != null ? fmtDuration(d.durationSeconds) : "-"],
    ["Uploaded", new Date(d.createdAt).toLocaleString()],
    ["Uploaded by", dash(d.uploadedBy)],
    ["Object key", dash(d.objectKey)],
  ];

  return (
    <div className="mt-5 space-y-5 pb-8">
      <Preview d={d} />
      {d.protected && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" /> Protected media. It is never public; this preview link is
          temporary.
        </p>
      )}
      {d.progress && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
          <div className="mb-2 text-xs font-semibold">Preparing for streaming</div>
          <ProcessingBar progress={d.progress} />
        </div>
      )}
      {d.status === "FAILED" && (
        <div className="space-y-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-xs text-primary-text">
          {d.processingError && <p>{d.processingError}</p>}
          {(d.type === "MOVIE_MASTER" || d.type === "AUDIOBOOK_FILE") && (
            <Btn
              disabled={retryProcessing.isPending}
              onClick={() =>
                retryProcessing.mutate(d.id, {
                  onSuccess: () => toast.success("Processing started again. This can take a while for large files."),
                  onError: (e) => toast.error(isApiError(e) ? e.message : "Could not start processing again. Please try again."),
                })
              }
            >
              <RefreshCw /> {retryProcessing.isPending ? "Starting…" : "Retry processing"}
            </Btn>
          )}
        </div>
      )}

      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-all">{v}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <StatusBadge status={STATUS_LABEL[d.status]} />
        </dd>
      </dl>

      {d.publicUrl && (
        <Btn
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(d.publicUrl!);
            toast.success("URL copied");
          }}
        >
          <Copy /> Copy public URL
        </Btn>
      )}

      <section aria-label="Used by" data-testid="used-by">
        <h3 className="mb-2 text-sm font-bold">Used by</h3>
        {used ? (
          <ul className="space-y-1.5">
            {d.usedBy.map((u, i) => (
              <li
                key={`${u.href}-${u.role}-${i}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{u.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {u.kind === "MOVIE"
                      ? "Movie"
                      : u.kind === "EBOOK"
                        ? "eBook"
                        : u.kind === "AUDIOBOOK"
                          ? "Audiobook"
                          : u.kind === "BANNER"
                            ? "Banner"
                            : "Collection"}{" "}
                    · {u.role}
                    {u.code ? ` · ${u.code}` : ""}
                  </span>
                </span>
                <Link
                  to={u.href as "/admin"}
                  className="shrink-0 text-xs font-semibold text-primary-text hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Not used anywhere yet.</p>
        )}
      </section>

      <section className="space-y-3" aria-label="Details">
        <h3 className="text-sm font-bold">Details</h3>
        <Field label="Display title">
          <TextInput
            value={form.displayTitle}
            maxLength={190}
            onChange={(e) => setForm({ ...form, displayTitle: e.target.value })}
          />
        </Field>
        {d.category === "images" && (
          <Field label="Alt text" hint="Describes the picture for screen readers.">
            <TextInput
              value={form.altText}
              maxLength={190}
              onChange={(e) => setForm({ ...form, altText: e.target.value })}
            />
          </Field>
        )}
        <Field label="Caption">
          <TextInput
            value={form.caption}
            maxLength={190}
            onChange={(e) => setForm({ ...form, caption: e.target.value })}
          />
        </Field>
        <Field
          label="Folder / tag"
          hint="A label for organising only. It never changes where the file is stored."
        >
          <TextInput
            value={form.folder}
            maxLength={100}
            onChange={(e) => setForm({ ...form, folder: e.target.value })}
          />
        </Field>
        <Field label="Internal notes">
          <TextArea
            rows={3}
            value={form.notes}
            maxLength={5000}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <Btn variant="primary" disabled={!dirty || update.isPending} onClick={save}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Btn>
      </section>

      <section className="space-y-3" aria-label="Replace file">
        <h3 className="text-sm font-bold">Replace file</h3>
        <p className="text-xs text-muted-foreground">
          Uploads a new file and swaps it in everywhere this one is used. The old file is kept until
          it is safe to clean up.
        </p>
        {showReplace ? (
          <UploadPanel queue={queue} single imagesOnly={d.category === "images"} />
        ) : (
          <Btn onClick={() => setShowReplace(true)} data-testid="replace-open">
            <Replace /> Replace…
          </Btn>
        )}
        {replace.isPending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-3.5 animate-spin" /> Swapping references…
          </p>
        )}
      </section>

      <section className="border-t border-border pt-4" aria-label="Delete">
        <Btn variant="danger" onClick={() => setConfirmDelete(true)} data-testid="delete-open">
          <Trash2 /> Delete
        </Btn>
        {used && (
          <p className="mt-2 text-xs text-muted-foreground">
            This file is in use, so deleting is blocked until it is detached or replaced.
          </p>
        )}
      </section>

      {used ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="This file is in use"
          description={`It is currently used by ${d.usedBy.map((u) => `${u.title} (${u.role})`).join(", ")}. Replace it or remove it from those items first.`}
          confirmLabel="OK"
          onConfirm={() => setConfirmDelete(false)}
        />
      ) : (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this file?"
          description="The file is removed from storage and from the library. This cannot be undone."
          onConfirm={del}
        />
      )}
    </div>
  );
}
