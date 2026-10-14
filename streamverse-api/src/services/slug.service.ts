import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { slugExists } from "../repositories/content.repository";

/** "The Last Horizon" -> "the-last-horizon". Never empty — falls back to "untitled". */
export function createSlugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents so "café" -> "cafe", not dropped entirely
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

/** Manual admin edits: same rules as generation, so a typed-in slug can't contain spaces/punctuation either. */
export const normalizeSlug = createSlugFromTitle;

/**
 * Appends `-2`, `-3`, ... until the slug is free. `excludeId` lets a rename check uniqueness without
 * colliding with the title's own current row. Content.slug is unique in the database as a second line of
 * defense (Section 47) — this just avoids needless 409s from an obviously-taken slug.
 */
export async function ensureUniqueSlug(base: string, excludeId?: string, client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  let candidate = base;
  for (let n = 2; await slugExists(candidate, excludeId, client); n++) candidate = `${base}-${n}`;
  return candidate;
}

/**
 * From a title (create) or a manually-typed slug (edit) to a guaranteed-unique one. Pass the enclosing
 * transaction's client when this runs as part of a content-creation write (see content.service.ts) —
 * otherwise a slug could be handed out here and taken by a concurrent request before the caller's own
 * insert commits.
 */
export async function uniqueSlugFor(input: { title?: string; manualSlug?: string }, excludeId?: string, client: Prisma.TransactionClient | typeof prisma = prisma): Promise<string> {
  const base = input.manualSlug ? normalizeSlug(input.manualSlug) : createSlugFromTitle(input.title ?? "");
  return ensureUniqueSlug(base, excludeId, client);
}
