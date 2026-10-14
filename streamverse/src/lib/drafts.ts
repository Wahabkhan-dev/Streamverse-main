import type { ItemType } from "./data";
import { createPersistedStore } from "./persisted";

/** Unfinished "Add new" wizards. Several can exist per content type; none overwrites another. */
export interface DraftRec {
  id: string;
  type: ItemType;
  title: string;
  createdAt: number;
  updatedAt: number;
  snapshot: unknown;
}
interface DraftState {
  drafts: DraftRec[];
}

const store = createPersistedStore<DraftState>("sv-drafts-v1", { drafts: [] });
export const hydrateDrafts = store.hydrate;
export const resetDrafts = store.reset;
export const useDrafts = () => store.use((s) => s.drafts);
export const useDraftsHydrated = store.useHydrated;
export const newDraftId = () => `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Returns false when browser storage rejected the write (the caller keeps the data in memory). */
export function saveDraft(id: string, type: ItemType, title: string, snapshot: unknown): boolean {
  return store.set((s) => {
    const prev = s.drafts.find((d) => d.id === id);
    const rec: DraftRec = { id, type, title, createdAt: prev?.createdAt ?? Date.now(), updatedAt: Date.now(), snapshot };
    return { drafts: prev ? s.drafts.map((d) => (d.id === id ? rec : d)) : [rec, ...s.drafts] };
  });
}
export const deleteDraft = (id: string) => void store.set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }));
export const editDraftId = (type: ItemType, slug: string) => `edit:${type}:${slug}`;
export const isEditDraft = (d: { id: string }) => d.id.startsWith("edit:");
