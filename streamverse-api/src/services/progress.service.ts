import { isCompleted } from "../constants/progress";
import * as contentRepository from "../repositories/content.repository";
import * as progressRepository from "../repositories/progress.repository";
import { NotFoundError } from "../utils/errors";
import { isCustomerVisible } from "./contentAccess.service";
import { recordActivity } from "./history.service";
import { cachedCardsByContentId } from "./mixedContent.service";
import type { AudiobookProgressInput, EbookProgressInput, MovieProgressInput } from "../validators/progress.validator";

/** Section 34/39/40: one upsert, percentage derived server-side, completion from the one shared threshold. */
export async function saveMovieProgress(userId: string, movieContentId: string, input: MovieProgressInput) {
  // the two reads are independent; the title is still checked on every save
  const [content, existing] = await Promise.all([contentRepository.findActiveById(movieContentId), progressRepository.findMovieProgress(userId, movieContentId)]);
  if (!content) throw new NotFoundError("Movie not found");
  const durationSeconds = input.durationSeconds ?? existing?.durationSeconds ?? null;
  const percentage = durationSeconds ? Math.min(100, (input.positionSeconds / durationSeconds) * 100) : (existing?.percentage ?? 0);
  const completed = isCompleted(percentage);
  // progress and history are separate rows: written together (each one statement in the usual case — see the repositories)
  const [saved] = await Promise.all([
    progressRepository.writeMovieProgress(userId, movieContentId, existing, { positionSeconds: input.positionSeconds, durationSeconds, percentage, completed }),
    recordActivity(userId, movieContentId, "WATCHED"), // Section 44: one row per title, not an event log
  ]);
  return saved;
}
export const getMovieProgress = (userId: string, movieContentId: string) => progressRepository.findMovieProgress(userId, movieContentId);

export async function saveEbookProgress(userId: string, ebookContentId: string, input: EbookProgressInput) {
  const [content, existing] = await Promise.all([contentRepository.findActiveById(ebookContentId), progressRepository.findEbookProgress(userId, ebookContentId)]);
  if (!content) throw new NotFoundError("eBook not found");
  const percentage = input.percentage ?? existing?.percentage ?? 0;
  const completed = isCompleted(percentage);
  const [saved] = await Promise.all([
    progressRepository.writeEbookProgress(userId, ebookContentId, existing, { location: input.location, page: input.page, percentage, completed }),
    recordActivity(userId, ebookContentId, "READ"),
  ]);
  return saved;
}
export const getEbookProgress = (userId: string, ebookContentId: string) => progressRepository.findEbookProgress(userId, ebookContentId);

/** Section 38: a supplied chapterId must actually belong to this audiobook. */
export async function saveAudiobookProgress(userId: string, audiobookContentId: string, input: AudiobookProgressInput) {
  const [content, chapter, existing] = await Promise.all([
    contentRepository.findActiveById(audiobookContentId),
    input.chapterId ? progressRepository.findChapter(input.chapterId) : null,
    progressRepository.findAudiobookProgress(userId, audiobookContentId),
  ]);
  if (!content) throw new NotFoundError("Audiobook not found");
  if (input.chapterId && (!chapter || chapter.audiobookId !== audiobookContentId)) throw new NotFoundError("That chapter does not belong to this audiobook.");
  const durationSeconds = input.durationSeconds ?? undefined;
  const percentage = durationSeconds ? Math.min(100, (input.positionSeconds / durationSeconds) * 100) : (existing?.percentage ?? 0);
  const completed = isCompleted(percentage);
  const [saved] = await Promise.all([
    progressRepository.writeAudiobookProgress(userId, audiobookContentId, existing, { chapterId: input.chapterId, positionSeconds: input.positionSeconds, percentage, completed }),
    recordActivity(userId, audiobookContentId, "LISTENED"),
  ]);
  return saved;
}
export const getAudiobookProgress = (userId: string, audiobookContentId: string) => progressRepository.findAudiobookProgress(userId, audiobookContentId);

/**
 * Section 41: Continue Watching/Reading/Listening — in progress, not completed, grouped by type. Per user, never cached as a whole:
 * the user's own progress rows are read fresh (3 light queries), the titles' public cards come from the shared card cache in one
 * batch, and visibility is checked for every title on every request.
 */
export async function getContinue(userId: string) {
  const [movies, ebooks, audiobooks] = await Promise.all([
    progressRepository.listInProgressMovieRefs(userId),
    progressRepository.listInProgressEbookRefs(userId),
    progressRepository.listInProgressAudiobookRefs(userId),
  ]);
  const cards = await cachedCardsByContentId([...movies.map((r) => r.movieId), ...ebooks.map((r) => r.ebookId), ...audiobooks.map((r) => r.audiobookId)]);
  // each card carries how far the customer got, so the homepage row can draw a progress bar without a second request
  const row = (refs: Array<{ id: string; percentage: number }>) =>
    refs.flatMap(({ id, percentage }) => {
      const cached = cards.get(id);
      return cached && isCustomerVisible(cached.content) ? [{ ...cached.card, percentage }] : [];
    });
  return {
    movies: row(movies.map((r) => ({ id: r.movieId, percentage: r.percentage }))),
    ebooks: row(ebooks.map((r) => ({ id: r.ebookId, percentage: r.percentage }))),
    audiobooks: row(audiobooks.map((r) => ({ id: r.audiobookId, percentage: r.percentage }))),
  };
}
