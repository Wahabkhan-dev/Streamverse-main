import * as genreRepository from "../repositories/genre.repository";
import { normalizeSlug } from "./slug.service";
import type { CreateGenreInput, UpdateGenreInput } from "../validators/genre.validator";
import { ConflictError } from "../utils/errors";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

/** Appends -2, -3, ... the same way content slugs do (Genre has its own uniqueness scope). */
async function uniqueGenreSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  for (let n = 2; await genreRepository.slugExists(candidate, excludeId); n++) candidate = `${base}-${n}`;
  return candidate;
}

export async function createGenre(input: CreateGenreInput, ctx: AuditContext = NO_ACTOR) {
  const slug = await uniqueGenreSlug(normalizeSlug(input.name));
  const genre = await genreRepository.create({ name: input.name, slug, description: input.description, contentType: input.contentType });
  await recordAudit(ctx, { action: "genre.created", entityType: "GENRE", entityId: genre.id, metadata: { name: genre.name } });
  return genre;
}

/** Renaming only ever changes `name` (and, if needed, `slug`) — every ContentGenre row keeps pointing at the same `id`. */
export async function renameGenre(id: string, input: UpdateGenreInput, ctx: AuditContext = NO_ACTOR) {
  const data: Parameters<typeof genreRepository.update>[1] = { ...input };
  if (input.name) data.slug = await uniqueGenreSlug(normalizeSlug(input.name), id);
  const genre = await genreRepository.update(id, data);
  await recordAudit(ctx, { action: "genre.updated", entityType: "GENRE", entityId: id, metadata: { fields: Object.keys(input) } });
  return genre;
}

/**
 * Section 16/26/67: a genre still in use cannot be deleted — refused with a clear count, never a silent
 * drop of the relationship. Deactivating it instead (PATCH `active: false`, via `renameGenre`) stays
 * available any time.
 */
export async function deleteGenre(id: string, ctx: AuditContext = NO_ACTOR) {
  const uses = await genreRepository.usageCount(id);
  if (uses > 0) throw new ConflictError(`This genre is used by ${uses} title${uses === 1 ? "" : "s"}. Move them to another genre first.`);
  const genre = await genreRepository.remove(id);
  await recordAudit(ctx, { action: "genre.deleted", entityType: "GENRE", entityId: id, metadata: { name: genre.name } });
  return genre;
}

/** The admin list: every genre (active or not) with how many titles use it, so deleting can be refused up front. */
export async function listGenres() {
  const [genres, usage] = await Promise.all([genreRepository.list(), genreRepository.usageCounts()]);
  return genres.map((g) => ({ ...g, usage: usage.get(g.id) ?? 0 }));
}
export const getGenre = genreRepository.findById;
export const listActiveGenres = genreRepository.listActive;
