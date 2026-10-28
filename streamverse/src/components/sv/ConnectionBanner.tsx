import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { API_BASE } from "@/lib/config";
import { bootstrapAuth } from "@/lib/authSession";
import { setServerReachable, useConnection } from "@/lib/connection";
import { Link } from "@tanstack/react-router";

const RECHECK_MS = 10_000;

/**
 * A slim bar on every page while the device is offline or StreamVerse's server cannot be reached. It never blocks the page
 * (a movie keeps playing, a form keeps its text) and goes away by itself the moment the connection is back.
 */
export function ConnectionBanner() {
  const state = useConnection();
  const qc = useQueryClient();

  // while the server is unreachable, ask it every few seconds; when the internet returns, refresh what failed
  useEffect(() => {
    if (state !== "server-unreachable") return undefined;
    const check = () =>
      void fetch(`${API_BASE}/health`, { cache: "no-store" })
        .then(() => {
          setServerReachable(true);
          void qc.invalidateQueries();
        })
        .catch(() => undefined);
    const t = window.setInterval(check, RECHECK_MS);
    return () => window.clearInterval(t);
  }, [state, qc]);
  useEffect(() => {
    const onBack = () => {
      void bootstrapAuth(true); // re-confirm who is signed in now that the server can be asked again
      void qc.invalidateQueries();
    };
    window.addEventListener("online", onBack);
    return () => window.removeEventListener("online", onBack);
  }, [qc]);

  if (state === "ok") return null;
  return (
    <div role="status" aria-live="polite" data-testid="connection-banner" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning/15 px-4 py-2 text-center text-sm text-warning">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>{state === "offline" ? "You're offline. Downloaded titles still work; everything else needs your internet." : "We can't reach StreamVerse right now. Retrying…"}</span>
      <Link to="/downloads" className="rounded border border-warning/40 px-2 py-0.5 text-xs font-semibold hover:bg-warning/10">
        My downloads
      </Link>
      {state === "server-unreachable" && (
        <button className="rounded border border-warning/40 px-2 py-0.5 text-xs font-semibold hover:bg-warning/10" onClick={() => void qc.invalidateQueries()}>
          Retry now
        </button>
      )}
    </div>
  );
}
