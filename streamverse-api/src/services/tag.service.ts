import * as tagRepository from "../repositories/tag.repository";
import { normalizeSlug } from "./slug.service";

/** "  Sci-Fi  " / "sci fi" / "SCI-FI" all normalize to the same slug ("sci-fi"), so duplicates never pile up. */
export const normalizeTagName = (name: string) => name.trim().replace(/\s+/g, " ");

/** Returns the existing tag for this name (case/whitespace-insensitive) or creates one. Never a duplicate. */
export async function findOrCreateTag(name: string) {
  const normalized = normalizeTagName(name);
  const slug = normalizeSlug(normalized);
  const existing = await tagRepository.findBySlug(slug);
  if (existing) return existing;
  return tagRepository.create({ name: normalized, slug });
}

export const listTags = tagRepository.list;
