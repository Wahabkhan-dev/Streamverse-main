import { useRouter } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** The installed app (PWA) opens in its own window with no browser toolbar, so it has no back / forward buttons of its own. */
const APP_WINDOW = "(display-mode: standalone), (display-mode: window-controls-overlay), (display-mode: fullscreen)";

function useInstalledApp(): boolean {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(APP_WINDOW);
    const read = () => setInstalled(mq.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return installed;
}

/** Chromium's Navigation API knows whether there is a page behind / ahead; elsewhere both buttons stay usable. */
type NavApi = EventTarget & { canGoBack: boolean; canGoForward: boolean };
function useHistoryEdges() {
  const [edges, setEdges] = useState({ back: true, forward: true });
  useEffect(() => {
    const nav = (window as Window & { navigation?: NavApi }).navigation;
    const read = () => setEdges(nav ? { back: nav.canGoBack, forward: nav.canGoForward } : { back: window.history.length > 1, forward: true });
    read();
    nav?.addEventListener("currententrychange", read);
    window.addEventListener("popstate", read);
    return () => {
      nav?.removeEventListener("currententrychange", read);
      window.removeEventListener("popstate", read);
    };
  }, []);
  return edges;
}

/** Back and Forward for the installed app; renders nothing in a normal browser tab, which has its own. */
export function AppNavButtons({ className }: { className?: string }) {
  const installed = useInstalledApp();
  const edges = useHistoryEdges();
  const router = useRouter();
  if (!installed) return null;
  const btn = "grid size-9 place-items-center rounded-md text-soft hover:bg-surface-3 hover:text-foreground disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className={cn("flex items-center", className)} data-testid="app-nav">
      <button type="button" className={btn} aria-label="Go back" title="Back (Alt+←)" disabled={!edges.back} onClick={() => router.history.back()}>
        <ChevronLeft className="size-5" />
      </button>
      <button type="button" className={btn} aria-label="Go forward" title="Forward (Alt+→)" disabled={!edges.forward} onClick={() => router.history.forward()}>
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
