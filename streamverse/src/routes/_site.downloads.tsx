import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Download, Film, Headphones, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Btn, ConfirmDialog, EmptyState, Panel, Tag } from "@/components/sv/ui";
import { useAuthState } from "@/lib/authState";
import { DEMO_MODE } from "@/lib/config";
import { storageEstimate } from "@/lib/offline/files";
import { cancelDownload, removeAllDownloads, removeDownload } from "@/lib/offline/downloads";
import { isUsable, useDownloadRecords, type DownloadRecord } from "@/lib/offline/store";

export const Route = createFileRoute("/_site/downloads")({
  head: () => ({ meta: [{ title: "Downloads — StreamVerse" }, { name: "description", content: "Movies, eBooks and audiobooks saved on this device for use with no internet." }] }),
  component: Downloads,
});

const megabytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);
const KIND_LABEL = { MOVIE: "Movie", EBOOK: "eBook", AUDIOBOOK: "Audiobook" } as const;
const KIND_ICON = { MOVIE: Film, EBOOK: BookOpen, AUDIOBOOK: Headphones } as const;

function PlayLink({ r }: { r: DownloadRecord }) {
  const cls = "inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 [&_svg]:size-4";
  if (r.type === "MOVIE")
    return (
      <Link to="/watch/$slug" params={{ slug: r.slug }} className={cls} data-testid="download-play">
        <Play className="fill-current" /> Play
      </Link>
    );
  if (r.type === "EBOOK")
    return (
      <Link to="/read/$slug" params={{ slug: r.slug }} className={cls} data-testid="download-play">
        <BookOpen /> Read
      </Link>
    );
  return (
    <Link to="/listen/$slug" params={{ slug: r.slug }} className={cls} data-testid="download-play">
      <Play className="fill-current" /> Listen
    </Link>
  );
}

function Row({ r, usable, onRemove }: { r: DownloadRecord; usable: boolean; onRemove: (r: DownloadRecord) => void }) {
  const Icon = KIND_ICON[r.type];
  const expired = r.status === "ready" && !usable;
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface-2 p-3 sm:p-4" data-testid="download-row">
      {r.posterUrl ? <img src={r.posterUrl} alt="" className="h-20 w-14 shrink-0 rounded-md bg-surface-3 object-cover" /> : <div className="grid h-20 w-14 shrink-0 place-items-center rounded-md bg-surface-3 text-soft"><Icon className="size-6" aria-hidden /></div>}
      <div className="min-w-0 flex-1 basis-48">
        <div className="truncate text-sm font-semibold">{r.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Tag>{KIND_LABEL[r.type]}</Tag>
          {r.status === "ready" ? <span>{megabytes(r.bytes)}</span> : null}
          {r.status === "ready" && !expired && <span>Available until {new Date(r.expiresAt).toLocaleDateString()}</span>}
          {expired && <span className="text-warning">Expired. Connect to the internet to renew.</span>}
          {r.status === "downloading" && <span>Downloading {Math.round(r.progress * 100)}%</span>}
          {r.status === "partial" && <span className="text-warning">{r.error ?? "Download paused"}</span>}
        </div>
        {r.status === "downloading" && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full bg-primary" style={{ width: `${Math.round(r.progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {r.status === "ready" && usable && <PlayLink r={r} />}
        <Btn size="sm" aria-label={`Remove ${r.title}`} onClick={() => onRemove(r)}>
          <Trash2 aria-hidden /> {r.status === "downloading" ? "Cancel" : "Remove"}
        </Btn>
      </div>
    </li>
  );
}

function Downloads() {
  const auth = useAuthState();
  const all = useDownloadRecords();
  const mine = all.filter((r) => r.userId === auth.user?.id).sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
  const [pending, setPending] = useState<DownloadRecord | null>(null);
  const [clearAll, setClearAll] = useState(false);
  const [space, setSpace] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    void storageEstimate().then(setSpace);
  }, [all.length]);

  if (DEMO_MODE)
    return (
      <div className="mx-auto max-w-[900px] px-4 pt-8 md:px-8">
        <EmptyState icon={Download} title="Downloads need a live account" sub="Offline downloads are available once StreamVerse is connected to its server." />
      </div>
    );

  return (
    <div className="mx-auto max-w-[900px] px-4 pt-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Downloads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Saved on this device, so they work with no internet.</p>
        </div>
        {mine.length > 1 && (
          <Btn onClick={() => setClearAll(true)}>
            <Trash2 aria-hidden /> Remove all
          </Btn>
        )}
      </div>

      <div className="mt-6">
        {mine.length === 0 ? (
          <EmptyState icon={Download} title="Nothing downloaded yet" sub="Open a movie, eBook or audiobook and choose Download. It will be here, ready to use with no internet." />
        ) : (
          <Panel className="p-4 sm:p-5">
            <ul aria-label="Downloaded titles" className="space-y-3">
              {mine.map((r) => (
                <Row key={r.contentId} r={r} usable={isUsable(r, auth.user?.id)} onRemove={setPending} />
              ))}
            </ul>
          </Panel>
        )}
        {space && mine.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            This site uses {megabytes(space.usage)} of the {megabytes(space.quota)} your browser allows.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.status === "downloading" ? "Cancel this download?" : "Remove this download?"}
        description={pending ? `"${pending.title}" will be removed from this device. You can download it again any time you are online.` : ""}
        confirmLabel={pending?.status === "downloading" ? "Cancel download" : "Remove"}
        onConfirm={() => {
          if (pending) void (pending.status === "downloading" ? cancelDownload(pending.contentId) : removeDownload(pending.contentId)).then(() => toast.success("Removed"));
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={clearAll}
        onOpenChange={setClearAll}
        title="Remove all downloads?"
        description="Everything saved on this device will be removed. You can download it again any time you are online."
        confirmLabel="Remove all"
        onConfirm={() => {
          void removeAllDownloads().then(() => toast.success("All downloads removed"));
          setClearAll(false);
        }}
      />
    </div>
  );
}
