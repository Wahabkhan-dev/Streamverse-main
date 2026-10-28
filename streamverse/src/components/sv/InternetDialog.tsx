import { Link, useRouter } from "@tanstack/react-router";
import { WifiOff } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEMO_MODE } from "@/lib/config";
import { dismissInternetPrompt, requestInternet, useInternetPrompt } from "@/lib/internetPrompt";
import { getAuthUser } from "@/lib/authState";
import { useConnection } from "@/lib/connection";
import { findByIdOrSlug, isUsable } from "@/lib/offline/store";

/** Pages that open with no internet: the Downloads screen, sign-in, and a title the customer saved on this device. */
function worksOffline(pathname: string): boolean {
  if (pathname === "/downloads" || pathname.startsWith("/sign-in")) return true;
  const m = /^\/(?:movies|ebooks|audiobooks|watch|read|listen)\/([^/?#]+)/.exec(pathname);
  return !!m && isUsable(findByIdOrSlug(decodeURIComponent(m[1]!)), getAuthUser()?.id);
}

/**
 * The popup that asks for a connection, and the guard behind it: with no internet, clicking a link to something that is not
 * saved on this device opens the popup (pointing at Downloads) instead of a page that can only fail to load.
 */
export function InternetDialog() {
  const message = useInternetPrompt();
  const connection = useConnection();
  const router = useRouter();

  useEffect(() => {
    if (DEMO_MODE) return undefined;
    const onClick = (e: MouseEvent) => {
      if (navigator.onLine || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (worksOffline(a.pathname)) return;
      e.preventDefault();
      e.stopPropagation();
      requestInternet("That page needs an internet connection. Titles you have downloaded still open.");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // the connection is back: the popup has done its job
  useEffect(() => {
    if (connection === "ok" && message !== null) {
      dismissInternetPrompt();
      toast.success("You're back online");
    }
  }, [connection, message]);

  return (
    <Dialog open={message !== null} onOpenChange={(o) => !o && dismissInternetPrompt()}>
      <DialogContent className="border-border bg-surface-2 sm:max-w-md" data-testid="internet-dialog">
        <DialogHeader>
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-warning/15 text-warning">
            <WifiOff className="size-6" aria-hidden />
          </div>
          <DialogTitle className="text-center">Connect to the internet</DialogTitle>
          <DialogDescription className="text-center">{message}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            to="/downloads"
            onClick={() => dismissInternetPrompt()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Open my downloads
          </Link>
          <button className="inline-flex h-10 items-center justify-center rounded-md border border-border px-5 text-sm font-semibold hover:bg-surface-3" onClick={() => dismissInternetPrompt()}>
            OK
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-5 text-sm font-semibold hover:bg-surface-3"
            onClick={() => {
              dismissInternetPrompt();
              void router.invalidate();
            }}
          >
            Try again
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
