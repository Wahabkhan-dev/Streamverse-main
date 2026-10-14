import * as libraryRepository from "../repositories/library.repository";
import * as contentRepository from "../repositories/content.repository";
import { isCustomerVisible } from "./contentAccess.service";
import { toMixedCards } from "./mixedContent.service";
import { NotFoundError } from "../utils/errors";

/**
 * Section 31: a separate concept from My List — Library is "content this account has access to / is
 * using", not a save-for-later shelf. Kept as its own table on purpose, even though today (no Stripe
 * yet) the two behave similarly from the API's point of view.
 */
export async function addToLibrary(userId: string, contentId: string) {
  const content = await contentRepository.findActiveById(contentId);
  if (!content || !isCustomerVisible(content)) throw new NotFoundError("This title is not available.");
  await libraryRepository.add(userId, contentId);
}

export async function removeFromLibrary(userId: string, contentId: string) {
  await libraryRepository.remove(userId, contentId);
}

/** Section 78: same documented behavior as My List — content no longer visible is hidden, not shown broken. */
export async function listLibrary(userId: string) {
  const items = await libraryRepository.list(userId);
  const visible = items.map((i) => i.content).filter((c) => isCustomerVisible(c));
  return toMixedCards(visible);
}
