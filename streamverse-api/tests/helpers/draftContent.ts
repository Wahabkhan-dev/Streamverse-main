import { createMovie } from "../../src/services/movie.service";
import { createMovieSchema } from "../../src/validators/movie.validator";
import { createEbook } from "../../src/services/ebook.service";
import { createEbookSchema } from "../../src/validators/ebook.validator";
import { createAudiobook } from "../../src/services/audiobook.service";
import { createAudiobookSchema } from "../../src/validators/audiobook.validator";

export async function makeDraftMovie(overrides: Record<string, unknown> = {}) {
  const { content, movie } = await createMovie(createMovieSchema.parse({ title: "Draft Movie", ...overrides }));
  return { content, movie };
}
export async function makeDraftEbook(overrides: Record<string, unknown> = {}) {
  const { content, ebook } = await createEbook(createEbookSchema.parse({ title: "Draft eBook", ...overrides }));
  return { content, ebook };
}
export async function makeDraftAudiobook(overrides: Record<string, unknown> = {}) {
  const { content, audiobook } = await createAudiobook(createAudiobookSchema.parse({ title: "Draft Audiobook", ...overrides }));
  return { content, audiobook };
}
