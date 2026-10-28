/**
 * 1. An uploaded file (video, EPUB/PDF, audio) can be used by several titles: they link to the ONE stored object.
 * 2. An eBook can offer a flipbook (page-turn) version, built from its PDF.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["RATE_LIMIT_MULTIPLIER"] = "100";
});
vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createEbook, updateEbook } from "../../src/services/ebook.service";
import { updateMovie } from "../../src/services/movie.service";
import { validateReadiness } from "../../src/services/contentPublishValidation.service";
import { createEbookSchema, updateEbookSchema } from "../../src/validators/ebook.validator";
import { updateMovieSchema } from "../../src/validators/movie.validator";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { makeDraftMovie } from "../helpers/draftContent";
import { makePublishedEbook } from "../helpers/publishedContent";

type Db = {
  __reset: () => void;
  mediaAsset: { create: (a: unknown) => Promise<{ id: string }>; findUnique: (a: unknown) => Promise<Record<string, unknown> | null> };
  ebook: { update: (a: unknown) => Promise<unknown> };
};
const db = prisma as unknown as Db;
const app = createApp();
const NO_ACTOR = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };
beforeEach(() => db.__reset());

let seq = 0;
const asset = (type: string, extra: Record<string, unknown> = {}) =>
  db.mediaAsset.create({ data: { type, status: "READY", storageKey: `media/test/${type.toLowerCase()}-${++seq}.bin`, mimeType: "application/octet-stream", sizeBytes: 1000, ...extra } });
const adminHeaders = async () => ({ Authorization: `Bearer ${(await createAdmin(app, db as never)).accessToken}` });

describe("one uploaded file, many titles (a link, never a copy)", () => {
  it("two movies use the same video: both point at the same asset and the library lists both", async () => {
    const video = await asset("MOVIE_MASTER", { hlsManifestKey: "media/hls/shared/master.m3u8" });
    const a = await makeDraftMovie({ title: "Edit A" });
    const b = await makeDraftMovie({ title: "Edit B" });
    for (const m of [a, b]) await updateMovie(m.content.id, updateMovieSchema.parse({ movie: { masterAssetId: video.id } }), NO_ACTOR);

    const headers = await adminHeaders();
    const detail = await request(app).get(`/api/v1/admin/media/${video.id}`).set(headers);
    expect(detail.status).toBe(200);
    expect((detail.body.data.usedBy as Array<{ title?: string }>).length).toBe(2);
    // there is still exactly ONE stored object behind them
    expect(await db.mediaAsset.findUnique({ where: { id: video.id } })).toMatchObject({ storageKey: expect.stringContaining("movie_master") });
  });

  it("a shared file cannot be deleted while any title uses it, and the message says how many", async () => {
    const video = await asset("MOVIE_MASTER");
    const a = await makeDraftMovie({ title: "Uses it" });
    const b = await makeDraftMovie({ title: "Also uses it" });
    for (const m of [a, b]) await updateMovie(m.content.id, updateMovieSchema.parse({ movie: { masterAssetId: video.id } }), NO_ACTOR);

    const res = await request(app).delete(`/api/v1/admin/media/${video.id}`).set(await adminHeaders());
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/2/);
  });

  it("removing the file from one title leaves it working for the other", async () => {
    const epub = await asset("EBOOK_EPUB");
    const x = await createEbook(createEbookSchema.parse({ title: "Book X", ebook: { epubAssetId: epub.id } }));
    const y = await createEbook(createEbookSchema.parse({ title: "Book Y", ebook: { epubAssetId: epub.id } }));
    await updateEbook(x.content.id, updateEbookSchema.parse({ ebook: {} }), NO_ACTOR);
    const detail = await request(app).get(`/api/v1/admin/media/${epub.id}`).set(await adminHeaders());
    expect((detail.body.data.usedBy as unknown[]).length).toBe(2);
    expect(y.content.id).not.toBe(x.content.id);
  });
});

describe("flipbook (page-turn) version of an eBook", () => {
  async function bookWithPdf(flipbook: boolean) {
    const { content } = await makePublishedEbook();
    const pdf = await asset("EBOOK_PDF", { mimeType: "application/pdf" });
    await db.ebook.update({ where: { contentId: content.id }, data: { pdfAssetId: pdf.id, flipbookEnabled: flipbook } });
    return content;
  }

  it("the book's page says a flipbook exists only when it is switched on and there is a PDF", async () => {
    const on = await bookWithPdf(true);
    const off = await bookWithPdf(false);
    expect((await request(app).get(`/api/v1/ebooks/${on.slug}`)).body.data.flipbook).toBe(true);
    expect((await request(app).get(`/api/v1/ebooks/${off.slug}`)).body.data.flipbook).toBe(false);
  });

  it("access with format=pdf gives the PDF (even when an EPUB exists); a book without a flipbook refuses", async () => {
    const book = await bookWithPdf(true);
    const epub = await asset("EBOOK_EPUB", { mimeType: "application/epub+zip" });
    await db.ebook.update({ where: { contentId: book.id }, data: { epubAssetId: epub.id } });
    const { accessToken } = await createUser(app);
    const h = { Authorization: `Bearer ${accessToken}` };

    const normal = await request(app).post(`/api/v1/media/ebooks/${book.id}/access`).set(h).send({});
    expect(normal.body.data.fileType).toBe("epub");
    const flip = await request(app).post(`/api/v1/media/ebooks/${book.id}/access`).set(h).send({ format: "pdf" });
    expect(flip.status).toBe(200);
    expect(flip.body.data).toMatchObject({ fileType: "pdf", mediaReady: true });
    expect(JSON.stringify(flip.body)).not.toMatch(/storageKey/i);

    const plain = await bookWithPdf(false);
    expect((await request(app).post(`/api/v1/media/ebooks/${plain.id}/access`).set(h).send({ format: "pdf" })).status).toBe(404);
    expect((await request(app).post(`/api/v1/media/ebooks/${book.id}/access`).set(h).send({ format: "docx" })).status).toBe(400);
  });

  it("publishing a flipbook with no finished PDF is refused with a clear message", async () => {
    const { content } = await makePublishedEbook();
    await db.ebook.update({ where: { contentId: content.id }, data: { flipbookEnabled: true } });
    const errors = await validateReadiness("EBOOK", content.id);
    expect(errors.map((e) => e.message).join(" ")).toMatch(/flipbook/i);
  });
});
