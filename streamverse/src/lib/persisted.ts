import { useSyncExternalStore } from "react";
import { toast } from "sonner";

let lastReport = 0;
/** One visible, rate-limited message whenever browser storage rejects a write. */
export function reportStorageFailure() {
  const now = Date.now();
  if (now - lastReport < 4000) return;
  lastReport = now;
  toast.error("Unable to save your changes locally.", { description: "Browser storage may be full. Remove large images or clear some site data." });
}

/** Writes to localStorage; returns false (and tells the person) when it fails. */
export function safeWrite(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    reportStorageFailure();
    return false;
  }
}

export function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * A tiny browser-persisted store. The server render and first client render use `seed`;
 * `hydrate()` then restores saved data so there is no hydration mismatch.
 * Everything that touches storage lives here, so a real API can replace it later.
 */
export function createPersistedStore<T>(key: string, seed: T, revive?: (saved: unknown, seed: T) => T, legacyKeys: string[] = []) {
  let state = seed;
  let hydrated = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  return {
    get: () => state,
    /** Returns false when the browser refused to store the data (it stays in memory). */
    set(fn: (s: T) => T): boolean {
      state = fn(state);
      const ok = safeWrite(key, JSON.stringify(state));
      emit();
      return ok;
    },
    hydrate() {
      if (hydrated) return;
      hydrated = true;
      const saved = [key, ...legacyKeys].map((k) => safeRead<unknown>(k)).find(Boolean) ?? null;
      if (saved) state = revive ? revive(saved, seed) : { ...seed, ...(saved as object) };
      emit();
    },
    reset() {
      state = seed;
      safeRemove(key);
      hydrated = true;
      emit();
    },
    use<S>(pick: (s: T) => S): S {
      return useSyncExternalStore(subscribe, () => pick(state), () => pick(seed));
    },
    useHydrated(): boolean {
      return useSyncExternalStore(subscribe, () => hydrated, () => false);
    },
  };
}
