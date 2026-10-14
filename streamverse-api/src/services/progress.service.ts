import { isCompleted } from "../constants/progress";
import * as contentRepository from "../repositories/content.repository";
import * as progressRepository from "../repositories/progress.repository";
import { NotFoundError } from "../utils/errors";
import { isCustomerVisible } from "./contentAccess.service";
import { recordActivity } from "./history.service";
import { toMixedCards } from "./mixedContent.service";
import type { AudiobookProgressInput, EbookProgressInput, MovieProgressInput } from "../validators/progress.validator";

/** Section 34/39/40: one upsert, percentage derived server-side, completion from the one shared threshold. */
export async function saveMovieProgress(userId: string, movieContentId: string, input: MovieProgressInput) {
  if (!(await contentRepository.findActiveById(movieContentId))) throw new NotFoundError("Movie not found");
  const existing = await progressRepository.findMovieProgress(userId, movieContentId);
  const durationSeconds = input.durationSeconds ?? existing?.durationSeconds ?? null;
  const percentage = durationSeconds ? Math.min(100, (input.positionSeconds / durationSeconds) * 100) : (existing?.percentage ?? 0);
  const completed = isCompleted(percentage);
  const saved = await progressRepository.upsertMovieProgress(userId, movieContentId, { positionSeconds: input.positionSeconds, durationSeconds, percentage, completed });
  await recordActivity(userId, movieContentId, "WATCHED"); // Section 44: one upsert, not an event log
  return saved;
}
export const getMovieProgress = (userId: string, movieContentId: string) => progressRepository.findMovieProgress(userId, movieContentId);

export async function saveEbookProgress(userId: string, ebookContentId: string, input: EbookProgressInput) {
  if (!(await contentRepository.findActiveById(ebookContentId))) throw new NotFoundError("eBook not found");
  const existing = await progressRepository.findEbookProgress(userId, ebookContentId);
  const percentage = input.percentage ?? existing?.percentage ?? 0;
  const completed = isCompleted(percentage);
  const saved = await progressRepository.upsertEbookProgress(userId, ebookContentId, { location: input.location, page: input.page, percentage, completed });
  await recordActivity(userId, ebookContentId, "READ");
  return saved;
}
export const getEbookProgress = (userId: string, ebookContentId: string) => progressRepository.findEbookProgress(userId, ebookContentId);

/** Section 38: a supplied chapterId must actually belong to this audiobook. */
export async function saveAudiobookProgress(userId: string, audiobookContentId: string, input: AudiobookProgressInput) {
  if (!(await contentRepository.findActiveById(audiobookContentId))) throw new NotFoundError("Audiobook not found");
  if (input.chapterId) {
    const chapter = await progressRepository.findChapter(input.chapterId);
    if (!chapter || chapter.audiobookId !== audiobookContentId) throw new NotFoundError("That chapter does not belong to this audiobook.");
  }
  const existing = await progressRepository.findAudiobookProgress(userId, audiobookContentId);
  const durationSeconds = input.durationSeconds ?? undefined;
  const percentage = durationSeconds ? Math.min(100, (input.positionSeconds / durationSeconds) * 100) : (existing?.percentage ?? 0);
  const completed = isCompleted(percentage);
  const saved = await progressRepository.upsertAudiobookProgress(userId, audiobookContentId, { chapterId: input.chapterId, positionSeconds: input.positionSeconds, percentage, completed });
  await recordActivity(userId, audiobookContentId, "LISTENED");
  return saved;
}
export const getAudiobookProgress = (userId: string, audiobookContentId: string) => progressRepository.findAudiobookProgress(userId, audiobookContentId);

/** Section 41: Continue Watching/Reading/Listening — in progress, not completed, grouped by type. */
export async function getContinue(userId: string) {
  const [movies, ebooks, audiobooks] = await Promise.all([
    progressRepository.listInProgressMovies(userId),
    progressRepository.listInProgressEbooks(userId),
    progressRepository.listInProgressAudiobooks(userId),
  ]);
  const movieContents = movies.map((p) => p.movie.content).filter((c) => isCustomerVisible(c));
  const ebookContents = ebooks.map((p) => p.ebook.content).filter((c) => isCustomerVisible(c));
  const audiobookContents = audiobooks.map((p) => p.audiobook.content).filter((c) => isCustomerVisible(c));
  const [movieCards, ebookCards, audiobookCards] = await Promise.all([toMixedCards(movieContents), toMixedCards(ebookContents), toMixedCards(audiobookContents)]);
  return { movies: movieCards, ebooks: ebookCards, audiobooks: audiobookCards };
}
