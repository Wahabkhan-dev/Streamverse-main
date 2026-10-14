import * as bookmarkRepository from "../repositories/bookmark.repository";
import * as contentRepository from "../repositories/content.repository";
import { NotFoundError } from "../utils/errors";
import type { CreateBookmarkInput } from "../validators/bookmark.validator";

/** Section 47: the ebook must exist; a location must be supplied — already enforced by the Zod schema. */
export async function createBookmark(userId: string, ebookId: string, input: CreateBookmarkInput) {
  if (!(await contentRepository.findActiveById(ebookId))) throw new NotFoundError("eBook not found");
  return bookmarkRepository.create(userId, ebookId, input);
}

export const listBookmarks = (userId: string, ebookId: string) => bookmarkRepository.list(userId, ebookId);

/**
 * Section 47: ownership checked before delete — never another user's bookmark. A bookmark that exists
 * but belongs to someone else returns the same 404 as one that doesn't exist at all, so the response
 * never confirms whether a given id belongs to another account.
 */
export async function deleteBookmark(userId: string, bookmarkId: string) {
  const bookmark = await bookmarkRepository.findById(bookmarkId);
  if (!bookmark || bookmark.userId !== userId) throw new NotFoundError("Bookmark not found");
  await bookmarkRepository.remove(bookmarkId);
}
