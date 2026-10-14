import * as myListRepository from "../repositories/myList.repository";
import * as contentRepository from "../repositories/content.repository";
import { isCustomerVisible } from "./contentAccess.service";
import { toMixedCards } from "./mixedContent.service";
import { NotFoundError } from "../utils/errors";

/**
 * Section 27: never a copy of title/cover/slug here — only `contentId`. Reading always re-joins Content,
 * so a rename/re-cover by Admin shows up immediately, with no My List row to update.
 *
 * Section 78 (documented choice): if saved content later becomes unpublished/archived/soft-deleted, it is
 * silently hidden from the list — not shown as a broken/"unavailable" card, and not an error. The saved
 * row itself is untouched, so it reappears automatically if the title comes back.
 */
export async function addToMyList(userId: string, contentId: string) {
  const content = await contentRepository.findActiveById(contentId);
  if (!content || !isCustomerVisible(content)) throw new NotFoundError("This title is not available to save.");
  await myListRepository.add(userId, contentId); // upsert: adding twice is a no-op, not an error (Section 26)
}

export async function removeFromMyList(userId: string, contentId: string) {
  await myListRepository.remove(userId, contentId); // Section 28: safe even if it was never saved
}

export async function listMyList(userId: string) {
  const saved = await myListRepository.list(userId);
  const visible = saved.map((s) => s.content).filter((c) => isCustomerVisible(c));
  return toMixedCards(visible);
}
