import type { ContentType, Prisma } from "@prisma/client";
import * as contentRepository from "../repositories/content.repository";
import { nextContentCode } from "./contentCode.service";
import { uniqueSlugFor } from "./slug.service";
import type { ContentBaseInput, ContentBaseUpdateInput } from "../validators/content.validator";

/** Shared Content fields, built once so Movie/Ebook/Audiobook services don't each re-derive them. */
function baseContentData(input: ContentBaseInput): Omit<Prisma.ContentUncheckedCreateInput, "contentCode" | "slug" | "type"> {
  return {
    title: input.title,
    summary: input.summary,
    description: input.description,
    visibility: input.visibility,
    releaseDate: input.releaseDate,
    availableFrom: input.availableFrom,
    availableUntil: input.availableUntil,
    ageRating: input.age?.ageRating,
    ageRestricted: input.age?.ageRestricted ?? false,
    minimumAge: input.age?.minimumAge,
    territoryMode: input.territory?.mode ?? "WORLDWIDE",
    featured: input.promo?.featured ?? false,
    trending: input.promo?.trending ?? false,
    popular: input.promo?.popular ?? false,
    newRelease: input.promo?.newRelease ?? false,
    seoTitle: input.seo?.seoTitle,
    seoDescription: input.seo?.seoDescription,
    seoKeywords: input.seo?.seoKeywords ?? [],
  };
}

/**
 * Creates the shared Content row for a new title: a fresh content code and a unique slug are assigned in
 * the SAME transaction the caller's own insert (Movie/Ebook/Audiobook row) runs in — if anything in that
 * transaction fails, the code and slug are never committed, so nothing is "used up" on a title that was
 * never actually created (see contentCode.service.ts).
 */
export async function createContentIn(tx: Prisma.TransactionClient, type: ContentType, input: ContentBaseInput, createdById: string | undefined) {
  const contentCode = await nextContentCode(type, tx);
  const slug = await uniqueSlugFor({ title: input.title, manualSlug: input.manualSlug }, undefined, tx);
  return tx.content.create({ data: { ...baseContentData(input), type, contentCode, slug, createdById } });
}

export const runInTransaction = contentRepository.runInTransaction;

/**
 * Section 5/8/11: builds the Content-level part of an update. Only fields actually present in `input`
 * are touched — Zod's `.partial()` means an omitted field is `undefined`, and `undefined` is filtered out
 * before this reaches Prisma (see content.repository.update), so a PATCH that only sends `{ title }`
 * never clobbers everything else back to its default. `id`/`contentCode`/`createdById`/`createdAt`/
 * `deletedAt` are never in this input type at all (Section 64–66) — there is no field here to even
 * attempt setting them from.
 */
export function buildContentUpdateData(input: ContentBaseUpdateInput): Prisma.ContentUncheckedUpdateInput {
  return {
    title: input.title,
    summary: input.summary,
    description: input.description,
    visibility: input.visibility,
    releaseDate: input.releaseDate,
    availableFrom: input.availableFrom,
    availableUntil: input.availableUntil,
    ...(input.age ? { ageRating: input.age.ageRating, ageRestricted: input.age.ageRestricted, minimumAge: input.age.minimumAge } : {}),
    ...(input.territory ? { territoryMode: input.territory.mode } : {}),
    ...(input.promo ? { featured: input.promo.featured, trending: input.promo.trending, popular: input.promo.popular, newRelease: input.promo.newRelease } : {}),
    ...(input.seo ? { seoTitle: input.seo.seoTitle, seoDescription: input.seo.seoDescription, seoKeywords: input.seo.seoKeywords } : {}),
  };
}

/**
 * Updates the Content-level scalar fields and, if `manualSlug` was sent, the slug (Section 63 — slug
 * only ever changes when the admin explicitly asks). Relation arrays (genres/tags/warnings/languages)
 * are type-specific input fields, not part of `ContentBaseUpdateInput` itself, so each of
 * movie/ebook/audiobook.service.ts calls `contentRepository.replace*` directly for the arrays *it*
 * received (Section 48 — replace, not append) in the same transaction as this call.
 */
export async function updateContentBaseIn(tx: Prisma.TransactionClient, contentId: string, input: ContentBaseUpdateInput) {
  const data = buildContentUpdateData(input);
  if (input.manualSlug) data.slug = await uniqueSlugFor({ manualSlug: input.manualSlug }, contentId, tx);
  if (input.territory?.countryCodes !== undefined) await contentRepository.replaceTerritories(tx, contentId, input.territory.countryCodes);
  return tx.content.update({ where: { id: contentId }, data });
}

export async function softDeleteContent(id: string) {
  return contentRepository.softDelete(id);
}

export async function getContentById(id: string) {
  return contentRepository.findById(id);
}
