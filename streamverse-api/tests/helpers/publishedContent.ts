import { createMovie } from "../../src/services/movie.service";
import { createMovieSchema } from "../../src/validators/movie.validator";
import { createEbook } from "../../src/services/ebook.service";
import { createEbookSchema } from "../../src/validators/ebook.validator";
import { createAudiobook } from "../../src/services/audiobook.service";
import { createAudiobookSchema } from "../../src/validators/audiobook.validator";
import { prisma } from "../../src/config/database";

/** Bypasses publish-validation (asset requirements) — these tests are about customer-visibility rules, not admin publish readiness. */
async function forcePublish(contentId: string) {
  await (prisma as unknown as { content: { update: (a: unknown) => Promise<unknown> } }).content.update({ where: { id: contentId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
}

export async function makePublishedMovie(overrides: Record<string, unknown> = {}) {
  const input = createMovieSchema.parse({ title: "Published Movie", ...overrides });
  const { content, movie } = await createMovie(input);
  await forcePublish(content.id);
  return { content: { ...content, status: "PUBLISHED" as const }, movie };
}

export async function makePublishedEbook(overrides: Record<string, unknown> = {}) {
  const input = createEbookSchema.parse({ title: "Published eBook", ...overrides });
  const { content, ebook } = await createEbook(input);
  await forcePublish(content.id);
  return { content: { ...content, status: "PUBLISHED" as const }, ebook };
}

export async function makePublishedAudiobook(overrides: Record<string, unknown> = {}) {
  const input = createAudiobookSchema.parse({ title: "Published Audiobook", ...overrides });
  const { content, audiobook } = await createAudiobook(input);
  await forcePublish(content.id);
  return { content: { ...content, status: "PUBLISHED" as const }, audiobook };
}
