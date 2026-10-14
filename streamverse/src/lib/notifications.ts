import { useMemo } from "react";
import { useAnnouncements } from "./store";
import { updateUser, useUser, type CustomerNoteKind } from "./user";

export interface CustomerNote {
  key: string;
  kind: CustomerNoteKind;
  t: string;
  s: string;
  at: number;
  read: boolean;
}

const prefKey = {
  "New Release": "newRelease",
  Subscription: "subscription",
  Recommendation: "recommendation",
  Account: "account",
} as const;

/** Announcements from the admin plus the customer's own notes, minus deleted ones and disabled kinds. */
export function useCustomerNotifications(): CustomerNote[] {
  const announcements = useAnnouncements();
  const notif = useUser((s) => s.notif);
  const prefs = useUser((s) => s.prefs.notifications);
  return useMemo(() => {
    const raw = [
      ...announcements.map((a) => ({ key: `a-${a.id}`, kind: a.kind, t: a.t, s: a.s, at: a.at })),
      ...notif.own.map((n) => ({ key: n.id, kind: n.kind, t: n.t, s: n.s, at: n.at })),
    ];
    return raw
      .filter((n) => !notif.deleted.includes(n.key) && prefs[prefKey[n.kind]])
      .map((n) => ({ ...n, read: notif.read.includes(n.key) }))
      .sort((a, b) => b.at - a.at);
  }, [announcements, notif, prefs]);
}

/** Adds a message to the customer's own notifications (billing, account, recommendations). */
export const pushOwnNote = (kind: CustomerNoteKind, t: string, s: string) =>
  updateUser((u) => ({ ...u, notif: { ...u.notif, own: [{ id: `own-${Date.now().toString(36)}`, kind, t, s, at: Date.now() }, ...u.notif.own] } }));

export const markNoteRead = (key: string) => updateUser((s) => (s.notif.read.includes(key) ? s : { ...s, notif: { ...s.notif, read: [...s.notif.read, key] } }));
export const markNoteUnread = (key: string) => updateUser((s) => ({ ...s, notif: { ...s.notif, read: s.notif.read.filter((k) => k !== key) } }));
export const markAllNotesRead = (keys: string[]) => updateUser((s) => ({ ...s, notif: { ...s.notif, read: [...new Set([...s.notif.read, ...keys])] } }));
export const deleteNote = (key: string) => updateUser((s) => ({ ...s, notif: { ...s.notif, deleted: [...new Set([...s.notif.deleted, key])] } }));

export function timeAgo(at: number, now = Date.now()): string {
  const d = Math.max(0, now - at);
  const m = Math.floor(d / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return days < 30 ? `${days}d` : new Date(at).toLocaleDateString();
}
