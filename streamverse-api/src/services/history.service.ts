import type { HistoryActivityType } from "@prisma/client";
import * as historyRepository from "../repositories/history.repository";
import { isCustomerVisible } from "./contentAccess.service";
import { toMixedCards } from "./mixedContent.service";
import { buildPagination, toSkipTake } from "../utils/pagination";

/** Section 44: called from progress updates — one upsert, never one row per play/read/listen tick. */
export const recordActivity = (userId: string, contentId: string, activityType: HistoryActivityType) => historyRepository.touch(userId, contentId, activityType);

/**
 * Section 43: removing a history entry only sets `removedAt` — it does NOT touch progress (a separate
 * concept, kept deliberately independent). Re-watching/reading/listening clears `removedAt` again
 * (see historyRepository.touch), so the entry naturally comes back.
 */
export async function removeFromHistory(userId: string, contentId: string) {
  await historyRepository.remove(userId, contentId);
}

export async function listHistory(userId: string, filters: { activityType?: HistoryActivityType }, page: number, limit: number) {
  const { skip, take } = toSkipTake(page, limit);
  const [rows, total] = await historyRepository.list(userId, filters, skip, take);
  const visible = rows.filter((r) => isCustomerVisible(r.content));
  const cards = await toMixedCards(visible.map((r) => r.content));
  const withActivity = cards.map((card, i) => ({ ...card, activityType: visible[i]!.activityType, lastAccessedAt: visible[i]!.lastAccessedAt }));
  return { rows: withActivity, pagination: buildPagination(total, page, limit) };
}
