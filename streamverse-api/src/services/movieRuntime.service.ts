import { prisma } from "../config/database";
import * as mediaAssetRepository from "../repositories/mediaAsset.repository";
import * as movieRepository from "../repositories/movie.repository";

/**
 * A movie's runtime is never typed in: it is the length of its main movie file, measured when the file is processed.
 * Called after a movie is saved and after its main file finishes processing (whichever happens last fills it in).
 * Leaves the runtime alone while there is no processed file to measure.
 */
export async function syncRuntimeFromMaster(contentId: string): Promise<void> {
  const movie = await movieRepository.findByContentId(contentId);
  if (!movie?.masterAssetId) return;
  const master = await mediaAssetRepository.findById(movie.masterAssetId);
  if (!master?.durationSeconds) return;
  const runtimeMinutes = Math.max(1, Math.round(master.durationSeconds / 60));
  if (movie.runtimeMinutes !== runtimeMinutes) await movieRepository.update(prisma, contentId, { runtimeMinutes });
}
