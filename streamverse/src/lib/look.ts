/**
 * The colour and photo a customer chose, kept per account on this device in their own place, so signing out (which wipes the
 * rest of the user store) or a refreshed profile from the server never loses them.
 */
const KEY = "sv-look-v1";

export type Look = { avatar?: number; avatarImage?: string | undefined };

const read = (): Record<string, Look> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Look>;
  } catch {
    return {};
  }
};

const who = (email: string) => email.trim().toLowerCase();

export function loadLook(email: string): Look {
  return email ? (read()[who(email)] ?? {}) : {};
}

/** Remembers a change for this account. Returns false when the browser refused to store it (e.g. storage full). */
export function saveLook(email: string, patch: Look): boolean {
  if (!email) return true;
  const all = read();
  const next: Look = { ...all[who(email)], ...patch };
  if (next.avatarImage === undefined) delete next.avatarImage;
  all[who(email)] = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}
