import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

/** The browser's install prompt event (not in the standard DOM typings yet). */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "sv-install-dismissed";
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

/** "Install StreamVerse" offer, shown only where the browser says the app can be installed and it is not installed already. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (readDismissed() || window.matchMedia("(display-mode: standalone)").matches) return undefined;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!event) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* storage unavailable: it simply shows again next visit */
    }
    setEvent(null);
  };

  return (
    <div role="dialog" aria-label="Install StreamVerse" data-testid="install-prompt" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-surface-2 p-3 shadow-xl">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
        <Download className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Install StreamVerse</div>
        <div className="text-xs text-muted-foreground">Open it like an app, straight from your home screen.</div>
      </div>
      <button
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary/90"
        onClick={() => {
          void event.prompt();
          void event.userChoice.then(() => setEvent(null));
        }}
      >
        Install
      </button>
      <button className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-3" aria-label="Not now" onClick={dismiss}>
        <X className="size-4" />
      </button>
    </div>
  );
}
