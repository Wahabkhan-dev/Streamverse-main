import type { ContentStatus, Visibility } from "@prisma/client";
import * as contentRepository from "../repositories/content.repository";
import * as movieRepository from "../repositories/movie.repository";
import { toSkipTake, buildPagination } from "../utils/pagination";
import { NotFoundError } from "../utils/errors";
import { assertNotStale } from "../utils/concurrency";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";
import { assertAssetRef, changedSlot, scheduleReplacementCleanup } from "./mediaAsset.service";
import type { CreateMovieInput, UpdateMovieInput } from "../validators/movie.validator";
import { createContentIn, runInTransaction, updateContentBaseIn } from "./content.service";

type MovieAssetSlots = { posterAssetId?: string | undefined; backdropAssetId?: string | undefined; thumbnailAssetId?: string | undefined; masterAssetId?: string | undefined; trailerAssetId?: string | undefined; teaserAssetId?: string | undefined };

async function assertMovieAssetRefs(movie: MovieAssetSlots, contentId?: string) {
  await Promise.all([
    assertAssetRef("movie.posterAssetId", movie.posterAssetId, ["POSTER"], contentId),
    assertAssetRef("movie.backdropAssetId", movie.backdropAssetId, ["BACKDROP"], contentId),
    assertAssetRef("movie.thumbnailAssetId", movie.thumbnailAssetId, ["THUMBNAIL"], contentId),
    assertAssetRef("movie.masterAssetId", movie.masterAssetId, ["MOVIE_MASTER"], contentId),
    assertAssetRef("movie.trailerAssetId", movie.trailerAssetId, ["TRAILER"], contentId),
    assertAssetRef("movie.teaserAssetId", movie.teaserAssetId, ["TEASER"], contentId),
  ]);
}

const MOVIE_ASSET_FIELDS = ["posterAssetId", "backdropAssetId", "thumbnailAssetId", "masterAssetId", "trailerAssetId", "teaserAssetId"] as const;

/**
 * One Content row, specialized as a Movie, with its genres/tags/warnings/languages/cast/crew/captions/
 * audio tracks — all in one transaction (Section 4/74: content + genres + tags is exactly this).
 */
const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

export async function createMovie(input: CreateMovieInput, ctx: AuditContext = NO_ACTOR) {
  await assertMovieAssetRefs(input.movie);
  const { content, movie } = await runInTransaction(async (tx) => {
    const content = await createContentIn(tx, "MOVIE", input, ctx.userId);
    const movie = await movieRepository.create(tx, content.id, input.movie);
    await Promise.all([
      contentRepository.addGenres(tx, content.id, input.genreIds),
      contentRepository.addTags(tx, content.id, input.tagIds),
      contentRepository.addWarnings(tx, content.id, input.warningTypeIds),
      contentRepository.addLanguages(tx, content.id, input.languages),
      contentRepository.addTerritories(tx, content.id, input.territory?.countryCodes ?? []),
      input.cast.length ? movieRepository.addCast(tx, movie.contentId, input.cast) : Promise.resolve(),
      input.crew.length ? movieRepository.addCrew(tx, movie.contentId, input.crew) : Promise.resolve(),
      input.captions.length ? movieRepository.addCaptions(tx, movie.contentId, input.captions) : Promise.resolve(),
      input.audioTracks.length ? movieRepository.addAudioTracks(tx, movie.contentId, input.audioTracks) : Promise.resolve(),
    ]);
    return { content, movie };
  });
  await recordAudit(ctx, { action: "content.created", entityType: "MOVIE", entityId: content.id, metadata: { contentCode: content.contentCode, title: content.title } });
  return { content, movie };
}

/** Section 5/48: every relation array present REPLACES the current selection; one omitted is left untouched. */
export async function updateMovie(contentId: string, input: UpdateMovieInput, ctx: AuditContext) {
  if (input.movie) await assertMovieAssetRefs(input.movie, contentId);
  if (input.captions) await Promise.all(input.captions.map((c) => assertAssetRef("captions[].mediaAssetId", c.mediaAssetId, ["CAPTION"], contentId)));
  if (input.audioTracks) await Promise.all(input.audioTracks.map((a) => assertAssetRef("audioTracks[].mediaAssetId", a.mediaAssetId, ["AUDIO_TRACK"], contentId)));

  const existing = await contentRepository.findActiveById(contentId);
  if (!existing) throw new NotFoundError("Movie not found");
  assertNotStale(existing.updatedAt, input.expectedUpdatedAt);

  // Section 44/45/68: snapshot the OLD asset ids before switching, so a replaced slot can be scheduled
  // for cleanup only AFTER the new reference is safely in place.
  const previousMovie = input.movie ? await movieRepository.findByContentId(contentId) : null;

  await runInTransaction(async (tx) => {
    await updateContentBaseIn(tx, contentId, input);
    if (Object.keys(input.movie ?? {}).length) await movieRepository.update(tx, contentId, input.movie!);
    if (input.genreIds !== undefined) await contentRepository.replaceGenres(tx, contentId, input.genreIds);
    if (input.tagIds !== undefined) await contentRepository.replaceTags(tx, contentId, input.tagIds);
    if (input.warningTypeIds !== undefined) await contentRepository.replaceWarnings(tx, contentId, input.warningTypeIds);
    if (input.languages !== undefined) await contentRepository.replaceLanguages(tx, contentId, input.languages);
    if (input.cast !== undefined) await movieRepository.replaceCast(tx, contentId, input.cast);
    if (input.crew !== undefined) await movieRepository.replaceCrew(tx, contentId, input.crew);
    if (input.captions !== undefined) await movieRepository.replaceCaptions(tx, contentId, input.captions);
    if (input.audioTracks !== undefined) await movieRepository.replaceAudioTracks(tx, contentId, input.audioTracks);
  });

  if (previousMovie && input.movie) {
    await Promise.all(MOVIE_ASSET_FIELDS.map((field) => scheduleReplacementCleanup(changedSlot(previousMovie[field], input.movie![field]), input.movie![field])));
  }

  await recordAudit(ctx, { action: "content.updated", entityType: "MOVIE", entityId: contentId, metadata: { fields: Object.keys(input).filter((k) => k !== "expectedUpdatedAt") } });
  return getFullMovie(contentId);
}

export async function getFullMovie(contentId: string) {
  const full = await movieRepository.findFullByContentId(contentId);
  if (!full || full.content.deletedAt) throw new NotFoundError("Movie not found");
  return full;
}

export const getMovie = (contentId: string) => movieRepository.findByContentId(contentId);

export interface ListFilters {
  page: number;
  limit: number;
  sortBy: "title" | "createdAt" | "updatedAt" | "releaseDate" | "publishedAt" | "status";
  sortOrder: "asc" | "desc";
  search?: string | undefined;
  status?: ContentStatus | undefined;
  visibility?: Visibility | undefined;
  genreId?: string | undefined;
  languageId?: string | undefined;
  ageRating?: string | undefined;
}

export async function listMovies(filters: ListFilters) {
  const where = contentRepository.adminListWhere("MOVIE", filters);
  const { skip, take } = toSkipTake(filters.page, filters.limit);
  const { rows, total } = await contentRepository.adminList(where, skip, take, { [filters.sortBy]: filters.sortOrder });
  return { rows, pagination: buildPagination(total, filters.page, filters.limit) };
}
