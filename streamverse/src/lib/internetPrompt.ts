import { useSyncExternalStore } from "react";

/** The "Connect to the internet" popup: anything that needs a connection while there is none asks for it here. */
let message: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function requestInternet(reason = "This needs an internet connection.") {
  message = reason;
  emit();
}
export function dismissInternetPrompt() {
  if (message === null) return;
  message = null;
  emit();
}

export const useInternetPrompt = (): string | null =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => message,
    () => null,
  );
