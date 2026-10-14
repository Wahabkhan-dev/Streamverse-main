import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import * as contentRepository from "../../src/repositories/content.repository";
import * as movieRepository from "../../src/repositories/movie.repository";
import { createMovie, getMovie } from "../../src/services/movie.service";
import { createEbook, getEbook } from "../../src/services/ebook.service";
import { createAudiobook, getAudiobook } from "../../src/services/audiobook.service";
import { createGenre } from "../../src/services/genre.service";
import { findOrCreateTag } from "../../src/services/tag.service";
import { createLanguage } from "../../src/services/language.service";
import { softDeleteContent } from "../../src/services/content.service";
import { createMovieSchema } from "../../src/validators/movie.validator";
import { createEbookSchema } from "../../src/validators/ebook.validator";
import { createAudiobookSchema } from "../../src/validators/audiobook.validator";

const db = prisma as unknown as { __reset: () => void };
beforeEach(() => db.__reset());

async function fixtures() {
  const genre = await createGenre({ name: "Thriller" });
  const tag = await findOrCreateTag("slow-burn");
  const language = await createLanguage({ code: "en", name: "English" });
  return { genre, tag, language };
}

describe("drafts: a title is a valid database row with only a title", () => {
  it("a movie draft needs nothing but a title", async () => {
    const input = createMovieSchema.parse({ title: "Untitled Project" });
    const { content, movie } = await createMovie(input);
    expect(content.status).toBe("DRAFT");
    expect(content.contentCode).toMatch(/^MOV-\d{6}$/);
    expect(movie.runtimeMinutes).toBeUndefined();
  });

  it("an eBook draft needs nothing but a title", async () => {
    const input = createEbookSchema.parse({ title: "Untitled Manuscript" });
    const { content } = await createEbook(input);
    expect(content.status).toBe("DRAFT");
    expect(content.contentCode).toMatch(/^EBK-\d{6}$/);
  });

  it("an audiobook draft needs nothing but a title", async () => {
    const input = createAudiobookSchema.parse({ title: "Untitled Audio" });
    const { content, audiobook } = await createAudiobook(input);
    expect(content.status).toBe("DRAFT");
    expect(content.contentCode).toMatch(/^AUD-\d{6}$/);
    expect(audiobook.durationSeconds).toBeUndefined(); // never guessed
  });
});

describe("relationships", () => {
  it("Content <-> Movie is one-to-one: a second Movie row for the same Content is rejected", async () => {
    const { content } = await createMovie(createMovieSchema.parse({ title: "Solo" }));
    await expect(movieRepository.create(prisma, content.id, {})).rejects.toMatchObject({ code: "P2002" });
  });

  it("a title can carry multiple genres and multiple tags", async () => {
    const { genre, tag, language } = await fixtures();
    const genre2 = await createGenre({ name: "Mystery" });
    const { content } = await createMovie(createMovieSchema.parse({ title: "Many Genres", genreIds: [genre.id, genre2.id], tagIds: [tag.id] }));
    const withRelations = await contentRepository.findWithRelations(content.id);
    expect(withRelations!.genres.map((g) => g.genre.name).sort()).toEqual(["Mystery", "Thriller"]);
    expect(withRelations!.tags.map((t) => t.tag.name)).toEqual(["slow-burn"]);
    void language;
  });

  it("a movie can carry multiple captions and multiple audio languages", async () => {
    const { language } = await fixtures();
    const fr = await createLanguage({ code: "fr", name: "French" });
    const input = createMovieSchema.parse({
      title: "Multilingual",
      captions: [{ languageId: language.id, type: "SUBTITLE" }, { languageId: fr.id, type: "SUBTITLE" }, { languageId: language.id, type: "SDH" }],
      audioTracks: [{ languageId: language.id }, { languageId: fr.id }],
    });
    const { movie } = await createMovie(input);
    const full = await getMovie(movie.contentId);
    expect(full!.captions).toHaveLength(3);
    expect(full!.audioTracks).toHaveLength(2);
  });

  it("an eBook can carry multiple translations (editions), never a duplicate full record", async () => {
    const es = await createLanguage({ code: "es", name: "Spanish" });
    const { ebook } = await createEbook(createEbookSchema.parse({ title: "The Original" }));
    const { addEdition } = await import("../../src/services/ebook.service.js");
    await addEdition(ebook.contentId, { languageId: es.id, translatedTitle: "El Original" });
    const full = await getEbook(ebook.contentId);
    expect(full!.editions).toHaveLength(1);
    expect(full!.editions[0]!.translatedTitle).toBe("El Original");
  });

  it("an audiobook can carry multiple chapters, numbered and ordered", async () => {
    const { audiobook } = await createAudiobook(createAudiobookSchema.parse({ title: "Serial" }));
    const { addChapter, getAudiobook: reload } = await import("../../src/services/audiobook.service.js");
    await addChapter(audiobook.contentId, { chapterNumber: 1, title: "Beginnings", displayOrder: 0 });
    await addChapter(audiobook.contentId, { chapterNumber: 2, title: "Middles", displayOrder: 1 });
    const full = await reload(audiobook.contentId);
    expect(full!.chapters.map((c: { chapterNumber: number }) => c.chapterNumber)).toEqual([1, 2]);
  });

  it("Homepage, Collection and Banner each reference Content by id, never a copy of its title/slug/cover", async () => {
    const { content } = await createMovie(createMovieSchema.parse({ title: "Referenced Everywhere" }));
    const homepageRepo = await import("../../src/repositories/homepage.repository.js");
    const collectionRepo = await import("../../src/repositories/collection.repository.js");
    const bannerRepo = await import("../../src/repositories/banner.repository.js");

    const section = await homepageRepo.createSection({ key: "trending_movies", displayTitle: "Trending Now", type: "auto" });
    await homepageRepo.addItem(section.id, content.id, 0);
    const homepageItems = await homepageRepo.itemsFor(section.id);
    expect(homepageItems[0]!.content.id).toBe(content.id);
    expect(homepageItems[0]).not.toHaveProperty("title");

    const collection = await collectionRepo.create({ name: "Staff Picks", slug: "staff-picks" });
    await collectionRepo.addItem(collection.id, content.id, 0);
    const collectionItems = await collectionRepo.itemsFor(collection.id);
    expect(collectionItems[0]!.content.id).toBe(content.id);

    const banner = await bannerRepo.create({ type: "HERO", title: "Check this out", linkedContentId: content.id });
    const loadedBanner = await bannerRepo.findById(banner.id);
    expect(loadedBanner!.linkedContent!.id).toBe(content.id);
    // renaming the title afterwards must not require touching the banner row at all
    await contentRepository.update(content.id, { title: "Renamed Entirely" });
    const afterRename = await bannerRepo.findById(banner.id);
    expect(afterRename!.linkedContent!.title).toBe("Renamed Entirely");
  });
});

describe("unique constraints", () => {
  it("rejects a duplicate contentCode", async () => {
    await contentRepository.create({ contentCode: "MOV-000001", type: "MOVIE", title: "A", slug: "a" });
    await expect(contentRepository.create({ contentCode: "MOV-000001", type: "MOVIE", title: "B", slug: "b" })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a duplicate slug", async () => {
    await contentRepository.create({ contentCode: "MOV-000001", type: "MOVIE", title: "A", slug: "same-slug" });
    await expect(contentRepository.create({ contentCode: "MOV-000002", type: "MOVIE", title: "B", slug: "same-slug" })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects a duplicate language code", async () => {
    await createLanguage({ code: "en", name: "English" });
    await expect(createLanguage({ code: "en", name: "English (dup)" })).rejects.toMatchObject({ message: expect.stringContaining("already exists") });
  });

  it("rejects adding the same genre to the same title twice", async () => {
    const { genre } = await fixtures();
    const { content } = await createMovie(createMovieSchema.parse({ title: "Once Only" }));
    await expect(contentRepository.addGenres(prisma, content.id, [genre.id, genre.id])).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("soft delete", () => {
  it("sets deletedAt, keeps the contentCode reserved, and keeps relations intact", async () => {
    const { genre } = await fixtures();
    const { content } = await createMovie(createMovieSchema.parse({ title: "Going Away", genreIds: [genre.id] }));
    await softDeleteContent(content.id);

    const reloaded = await contentRepository.findById(content.id);
    expect(reloaded!.deletedAt).not.toBeNull();
    expect(reloaded!.contentCode).toBe(content.contentCode); // never freed for reuse

    const withRelations = await contentRepository.findWithRelations(content.id);
    expect(withRelations!.genres).toHaveLength(1); // soft delete does not cascade/clear joins

    // the next movie created does NOT get the deleted title's old code
    const { content: next } = await createMovie(createMovieSchema.parse({ title: "Something New" }));
    expect(next.contentCode).not.toBe(content.contentCode);
  });
});
