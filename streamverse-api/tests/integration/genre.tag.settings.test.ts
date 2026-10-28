import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import { createMovieSchema } from "../../src/validators/movie.validator";
import { createMovie } from "../../src/services/movie.service";
import { createGenre, deleteGenre, listGenres, renameGenre } from "../../src/services/genre.service";
import { findOrCreateTag } from "../../src/services/tag.service";
import { getSetting, setSetting } from "../../src/services/settings.service";
import * as contentRepository from "../../src/repositories/content.repository";

const db = prisma as unknown as { __reset: () => void };
beforeEach(() => db.__reset());

describe("genres", () => {
  it("renaming a genre keeps every title's relationship (joins are by id, not name)", async () => {
    const genre = await createGenre({ name: "Sci-Fi" });
    const { content } = await createMovie(createMovieSchema.parse({ title: "Starbound", genreIds: [genre.id] }));

    await renameGenre(genre.id, { name: "Science Fiction" });

    const withRelations = await contentRepository.findWithRelations(content.id);
    expect(withRelations!.genres).toHaveLength(1);
    expect(withRelations!.genres[0]!.genre.name).toBe("Science Fiction");
    expect(withRelations!.genres[0]!.genreId).toBe(genre.id); // same relationship, unchanged id
  });

  it("refuses to delete a genre that is still in use, with a clear count", async () => {
    const genre = await createGenre({ name: "Horror" });
    await createMovie(createMovieSchema.parse({ title: "Scream Test", genreIds: [genre.id] }));
    await expect(deleteGenre(genre.id)).rejects.toMatchObject({ message: expect.stringContaining("used by 1 title") });
  });

  it("the admin list says how many titles use each genre, and an update can clear its kind", async () => {
    const used = await createGenre({ name: "Drama", contentType: "MOVIE" });
    const unused = await createGenre({ name: "Cooking", contentType: "EBOOK" });
    await createMovie(createMovieSchema.parse({ title: "Two Rooms", genreIds: [used.id] }));
    const rows = await listGenres();
    expect(rows.find((g) => g.id === used.id)?.usage).toBe(1);
    expect(rows.find((g) => g.id === unused.id)?.usage).toBe(0);

    // null makes it apply to every kind of title again
    await renameGenre(unused.id, { contentType: null });
    expect((await listGenres()).find((g) => g.id === unused.id)?.contentType).toBeNull();
  });

  it("deletes a genre that nothing uses", async () => {
    const genre = await createGenre({ name: "Unused" });
    await expect(deleteGenre(genre.id)).resolves.toBeTruthy();
  });
});

describe("tags", () => {
  it("normalizes case/whitespace so the same tag is never created twice", async () => {
    const a = await findOrCreateTag("Slow Burn");
    const b = await findOrCreateTag("  slow   burn ");
    expect(b.id).toBe(a.id);
  });
});

describe("app settings", () => {
  it("round-trips a boolean through its stored text representation", async () => {
    await setSetting({ key: "maintenanceMode", value: true });
    expect(await getSetting("maintenanceMode")).toBe(true);
    await setSetting({ key: "maintenanceMode", value: false });
    expect(await getSetting("maintenanceMode")).toBe(false);
  });

  it("round-trips a string setting", async () => {
    await setSetting({ key: "defaultLanguage", value: "fr" });
    expect(await getSetting("defaultLanguage")).toBe("fr");
  });

  it("an unknown key is rejected by the validator before it ever reaches the database", async () => {
    const { settingValueSchema } = await import("../../src/validators/settings.validator.js");
    expect(settingValueSchema.safeParse({ key: "notARealSetting", value: true }).success).toBe(false);
  });
});
