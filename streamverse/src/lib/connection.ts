import { useSyncExternalStore } from "react";

/**
 * Can this device reach StreamVerse right now? Two separate causes, shown differently:
 *   offline            the browser has no internet (it says so itself)
 *   serverUnreachable  the internet works but our API did not answer (down, blocked network); set by the API client
 */
let serverUnreachable = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setServerReachable(reachable: boolean) {
  if (serverUnreachable === !reachable) return;
  serverUnreachable = !reachable;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export type ConnectionState = "ok" | "offline" | "server-unreachable";

export function useConnection(): ConnectionState {
  return useSyncExternalStore(
    subscribe,
    (): ConnectionState => (!navigator.onLine ? "offline" : serverUnreachable ? "server-unreachable" : "ok"),
    (): ConnectionState => "ok",
  );
}
