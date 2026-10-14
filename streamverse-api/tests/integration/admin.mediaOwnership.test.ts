import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin } from "../helpers/adminAuth";
import { makeDraftAudiobook, makeDraftEbook, makeDraftMovie } from "../helpers/draftContent";
import { updateMovie } from "../../src/services/movie.service";
import { updateMovieSchema } from "../../src/validators/movie.validator";
import { addEdition as addEbookEdition } from "../../src/services/ebook.service";
import { addChapter } from "../../src/services/audiobook.service";
import { createLanguage } from "../../src/services/language.service";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

async function readyAsset(type: string, contentId: string | null = null) {
  return (prisma as unknown as { mediaAsset: { create: (a: unknown) => Promise<{ id: string }> } }).mediaAsset.create({ data: { type, contentId, status: "READY" } });
}

const NO_ACTOR = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

describe("Media ownership (Section 43/100)", () => {
  it("an asset uploaded for Movie A cannot be attached to Movie B", async () => {
    const { content: movieA } = await makeDraftMovie({ title: "Movie A" });
    const { content: movieB } = await makeDraftMovie({ title: "Movie B" });
    const asset = await readyAsset("POSTER", movieA.id);

    const res = await updateMovie(movieB.id, updateMovieSchema.parse({ movie: { posterAssetId: asset.id } }), NO_ACTOR).catch((e) => e);
    expect(res).toBeInstanceOf(Error);
    expect((res as { statusCode?: number }).statusCode).toBe(400);
  });

  it("allows attaching an asset uploaded for the SAME content", async () => {
    const { content } = await makeDraftMovie();
    const asset = await readyAsset("POSTER", content.id);
    const updated = await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: asset.id } }), NO_ACTOR);
    expect(updated.posterAssetId).toBe(asset.id);
  });

  it("allows attaching an asset that was never scoped to any content (contentId null)", async () => {
    const { content } = await makeDraftMovie();
    const asset = await readyAsset("POSTER", null);
    const updated = await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: asset.id } }), NO_ACTOR);
    expect(updated.posterAssetId).toBe(asset.id);
  });

  it("a chapter asset cannot attach to an unrelated audiobook's chapter", async () => {
    const { content: bookA } = await makeDraftAudiobook({ title: "Book A", audiobook: { deliveryMode: "CHAPTER_FILES" } });
    const { content: bookB } = await makeDraftAudiobook({ title: "Book B", audiobook: { deliveryMode: "CHAPTER_FILES" } });
    const assetForA = await readyAsset("AUDIOBOOK_CHAPTER", bookA.id);

    const res = await addChapter(bookB.id, { chapterNumber: 1, title: "Chapter 1", audioAssetId: assetForA.id, displayOrder: 0 }, NO_ACTOR).catch((e) => e);
    expect(res).toBeInstanceOf(Error);
    expect((res as { statusCode?: number }).statusCode).toBe(400);
  });

  it("an edition file cannot attach to an unrelated eBook's edition", async () => {
    const { content: bookA } = await makeDraftEbook({ title: "Book A" });
    const { content: bookB } = await makeDraftEbook({ title: "Book B" });
    const language = await createLanguage({ code: "de", name: "German" });
    const assetForA = await readyAsset("EBOOK_EPUB", bookA.id);

    const res = await addEbookEdition(bookB.id, { languageId: language.id, translatedTitle: "Titel", epubAssetId: assetForA.id }, NO_ACTOR).catch((e) => e);
    expect(res).toBeInstanceOf(Error);
    expect((res as { statusCode?: number }).statusCode).toBe(400);
  });

  it("requires READY status before an asset can be attached", async () => {
    const { content } = await makeDraftMovie();
    const pendingAsset = await (prisma as unknown as { mediaAsset: { create: (a: unknown) => Promise<{ id: string }> } }).mediaAsset.create({ data: { type: "POSTER", contentId: content.id, status: "PROCESSING" } });

    const res = await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: pendingAsset.id } }), NO_ACTOR).catch((e) => e);
    expect(res).toBeInstanceOf(Error);
    expect((res as { statusCode?: number }).statusCode).toBe(400);
  });
});

describe("Admin media status/delete API (Section 66/67)", () => {
  it("lists every attached/uploaded asset for a content row, without a storage secret", async () => {
    const { content } = await makeDraftMovie();
    await readyAsset("POSTER", content.id);
    const headers = await admin();
    const res = await request(app).get(`/api/v1/admin/content/${content.id}/media`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/i);
  });

  it("deletes an unattached asset immediately", async () => {
    const { content } = await makeDraftMovie();
    const asset = await readyAsset("POSTER", content.id);
    const headers = await admin();
    const res = await request(app).delete(`/api/v1/admin/media/${asset.id}`).set(headers);
    expect(res.status).toBe(200);
    const row = await prisma.mediaAsset.findUnique({ where: { id: asset.id } });
    expect(row!.status).toBe("DELETED");
  });

  it("refuses to delete an asset still attached to PUBLISHED content", async () => {
    const { content } = await makeDraftMovie();
    const asset = await readyAsset("POSTER", content.id);
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: asset.id } }), NO_ACTOR);
    await (prisma as unknown as { content: { update: (a: unknown) => Promise<unknown> } }).content.update({ where: { id: content.id }, data: { status: "PUBLISHED" } });

    const headers = await admin();
    const res = await request(app).delete(`/api/v1/admin/media/${asset.id}`).set(headers);
    expect(res.status).toBe(409);
  });
});
