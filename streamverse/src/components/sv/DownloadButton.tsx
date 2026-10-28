import { Check, Download, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useIsAuthenticated } from "@/lib/authState";
import { DEMO_MODE } from "@/lib/config";
import { requestInternet } from "@/lib/internetPrompt";
import { cancelDownload, isDownloading, removeDownload, startDownload } from "@/lib/offline/downloads";
import { useDownloadRecord } from "@/lib/offline/store";
import { Btn } from "./ui";

type Kind = "MOVIE" | "EBOOK" | "AUDIOBOOK";
const KIND: Record<"Movie" | "eBook" | "Audiobook", Kind> = { Movie: "MOVIE", eBook: "EBOOK", Audiobook: "AUDIOBOOK" };

/**
 * "Download": saves a movie, eBook or audiobook on this device so it plays, opens or sounds with no internet.
 * Shows progress while it saves, "Downloaded" when done, and picks an interrupted download back up where it stopped.
 */
export function DownloadButton({ item }: { item: { type: "Movie" | "eBook" | "Audiobook"; slug: string; id?: string } }) {
  const authed = useIsAuthenticated();
  const rec = useDownloadRecord(item.id ?? item.slug);
  if (DEMO_MODE || !authed || !item.id) return null; // demo has no server copy to save; guests sign in first

  const contentId = item.id;
  const begin = () => {
    if (!navigator.onLine) return requestInternet("Downloading needs an internet connection. Connect, then try again.");
    startDownload({ contentId, slug: item.slug, type: KIND[item.type] })
      .then(() => toast.success("Downloaded. It now works with no internet."))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "The download did not finish."));
  };

  if (rec?.status === "ready") {
    return (
      <span className="inline-flex gap-1">
        <Btn size="lg" variant="glass" disabled data-testid="download-done" aria-label="Downloaded">
          <Check /> Downloaded
        </Btn>
        <Btn size="lg" variant="glass" aria-label="Remove download" title="Remove download" data-testid="download-remove" onClick={() => void removeDownload(contentId).then(() => toast.success("Download removed"))}>
          <Trash2 />
        </Btn>
      </span>
    );
  }
  if (rec && (rec.status === "downloading" || isDownloading(contentId))) {
    return (
      <span className="inline-flex gap-1">
        <Btn size="lg" variant="glass" disabled data-testid="download-progress">
          <Loader2 className="animate-spin" /> {Math.round(rec.progress * 100)}%
        </Btn>
        <Btn size="lg" variant="glass" aria-label="Cancel download" title="Cancel download" onClick={() => void cancelDownload(contentId)}>
          <X />
        </Btn>
      </span>
    );
  }
  return (
    <Btn size="lg" variant="glass" onClick={begin} data-testid="download-start" title={rec?.error}>
      <Download /> {rec?.status === "partial" ? "Resume download" : "Download"}
    </Btn>
  );
}
