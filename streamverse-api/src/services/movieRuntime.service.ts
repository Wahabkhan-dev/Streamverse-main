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

/** Brings every movie's runtime in line with its main file (titles saved before runtimes were measured kept a typed number). */
export async function syncAllRuntimes(): Promise<number> {
  const movies = await prisma.movie.findMany({ where: { masterAssetId: { not: null } }, select: { contentId: true, runtimeMinutes: true, masterAssetId: true } });
  let fixed = 0;
  for (const m of movies) {
    const master = await mediaAssetRepository.findById(m.masterAssetId as string);
    if (!master?.durationSeconds) continue;
    const runtimeMinutes = Math.max(1, Math.round(master.durationSeconds / 60));
    if (m.runtimeMinutes === runtimeMinutes) continue;
    await movieRepository.update(prisma, m.contentId, { runtimeMinutes });
    fixed++;
  }
  return fixed;
}
