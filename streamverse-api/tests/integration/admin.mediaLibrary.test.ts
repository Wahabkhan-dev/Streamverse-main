import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Each test registers its own admin; lift the per-IP limiter (dev/test-only knob, rejected in production).
vi.hoisted(() => {
  process.env["RATE_LIMIT_MULTIPLIER"] = "100";
});

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { getStorageProvider } from "../../src/services/storage";
import { updateMovie } from "../../src/services/movie.service";
import { updateMovieSchema } from "../../src/validators/movie.validator";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { makeDraftMovie } from "../helpers/draftContent";

type Db = {
  __reset: () => void;
  mediaAsset: { create: (a: unknown) => Promise<{ id: string; storageKey: string | null }>; findUnique: (a: unknown) => Promise<Record<string, unknown> | null> };
};
const db = prisma as unknown as Db;
const app = createApp();
const NO_ACTOR = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

beforeEach(() => db.__reset());

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

let seq = 0;
async function asset(type: string, extra: Record<string, unknown> = {}, putObject = true) {
  const storageKey = `content/seed/${type.toLowerCase()}/${++seq}.bin`;
  if (putObject) await getStorageProvider().putObject(storageKey, Buffer.from("x"), "application/octet-stream");
  return db.mediaAsset.create({ data: { type, status: "READY", storageKey, originalFileName: `file-${seq}.jpg`, mimeType: "image/jpeg", sizeBytes: 1000, width: 1000, height: 1500, ...extra } });
}

function fakeJpeg(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof0 = Buffer.alloc(19);
  sof0.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0.set([0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01], 9);
  return Buffer.concat([soi, app0, sof0, Buffer.from([0xff, 0xd9])]);
}

/** The real upload flow, library mode: presign -> PUT bytes -> complete. */
async function uploadLibraryImage(headers: Record<string, string>, width = 800, height = 1200, fileName = "hero.jpg") {
  const bytes = fakeJpeg(width, height);
  const presign = await request(app).post("/api/v1/admin/uploads/presign").set(headers).send({ library: true, purpose: "LIBRARY_IMAGE", fileName, mimeType: "image/jpeg", sizeBytes: bytes.length });
  expect(presign.status).toBe(201);
  const put = await request(app).put(presign.body.data.uploadUrl).set("Content-Type", "image/jpeg").send(bytes);
  expect(put.status).toBeLessThan(300);
  const done = await request(app).post(`/api/v1/admin/uploads/${presign.body.data.assetId}/complete`).set(headers).send({});
  expect(done.status).toBe(200);
  return presign.body.data.assetId as string;
}

describe("Media Library: access", () => {
  it("401 anonymous, 403 USER, 200 ADMIN on list and stats", async () => {
    expect((await request(app).get("/api/v1/admin/media")).status).toBe(401);
    const { accessToken } = await createUser(app);
    expect((await request(app).get("/api/v1/admin/media").set({ Authorization: `Bearer ${accessToken}` })).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/media/stats").set({ Authorization: `Bearer ${accessToken}` })).status).toBe(403);
    const headers = await admin();
    expect((await request(app).get("/api/v1/admin/media").set(headers)).status).toBe(200);
    expect((await request(app).get("/api/v1/admin/media/stats").set(headers)).status).toBe(200);
  });
});

describe("Media Library: list, filters, search, sort, pagination", () => {
  it("shows existing assets of every kind without any re-upload and never leaks the object key", async () => {
    const headers = await admin();
    await asset("POSTER");
    await asset("MOVIE_MASTER", { mimeType: "video/mp4" });
    await asset("AUDIOBOOK_FILE", { mimeType: "audio/mpeg" });
    await asset("EBOOK_EPUB", { mimeType: "application/epub+zip" });
    const res = await request(app).get("/api/v1/admin/media").set(headers);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.pagination).toMatchObject({ page: 1, total: 4 });
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey|objectKey|content\/seed/);
    const poster = res.body.data.find((a: { type: string }) => a.type === "POSTER");
    expect(poster.thumbnailUrl).toBeTruthy();
    expect(res.body.data.find((a: { type: string }) => a.type === "MOVIE_MASTER").thumbnailUrl).toBeNull(); // videos never get a card URL
  });

  it("filters by category, role and status", async () => {
    const headers = await admin();
    await asset("POSTER");
    await asset("BACKDROP");
    await asset("MOVIE_MASTER", { mimeType: "video/mp4" });
    await asset("POSTER", { status: "FAILED" });
    const types = async (qs: string) => (await request(app).get(`/api/v1/admin/media?${qs}`).set(headers)).body.data.map((a: { type: string }) => a.type).sort();
    expect(await types("category=images")).toEqual(["BACKDROP", "POSTER", "POSTER"]);
    expect(await types("category=videos")).toEqual(["MOVIE_MASTER"]);
    expect(await types("assetRole=BACKDROP")).toEqual(["BACKDROP"]);
    expect(await types("status=FAILED")).toEqual(["POSTER"]);
  });

  it("searches by filename, display title, owning title, content code and asset type", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie({ title: "Moonlight Run" });
    const poster = await asset("POSTER", { originalFileName: "alpha.jpg" });
    await asset("BACKDROP", { originalFileName: "beta.jpg", displayTitle: "Sunset wide" });
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: poster.id } }), NO_ACTOR);
    const find = async (q: string) => (await request(app).get(`/api/v1/admin/media?search=${encodeURIComponent(q)}`).set(headers)).body.data.map((a: { fileName: string }) => a.fileName);
    expect(await find("alpha")).toEqual(["alpha.jpg"]);
    expect(await find("Sunset")).toEqual(["beta.jpg"]);
    expect(await find("Moonlight")).toEqual(["alpha.jpg"]); // found via the movie that uses it
    expect(await find(content.contentCode)).toEqual(["alpha.jpg"]);
    expect(await find("backdrop")).toEqual(["beta.jpg"]);
    expect(await find("zzzz-nothing")).toEqual([]);
  });

  it("filters attached vs unattached by what they are used by", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const used = await asset("POSTER");
    const free = await asset("POSTER");
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: used.id } }), NO_ACTOR);
    const list = async (qs: string) => (await request(app).get(`/api/v1/admin/media?${qs}`).set(headers)).body.data.map((a: { id: string }) => a.id);
    expect(await list("attachedType=movies")).toEqual([used.id]);
    expect(await list("attachedType=unattached")).toEqual([free.id]);
    expect(await list("attachedType=ebooks")).toEqual([]);
  });

  it("sorts and paginates on the server", async () => {
    const headers = await admin();
    await asset("POSTER", { originalFileName: "b.jpg", sizeBytes: 10 });
    await asset("POSTER", { originalFileName: "a.jpg", sizeBytes: 300 });
    await asset("POSTER", { originalFileName: "c.jpg", sizeBytes: 200 });
    const names = async (qs: string) => (await request(app).get(`/api/v1/admin/media?${qs}`).set(headers)).body.data.map((a: { fileName: string }) => a.fileName);
    expect(await names("sort=name")).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(await names("sort=size")).toEqual(["a.jpg", "c.jpg", "b.jpg"]);
    const page2 = await request(app).get("/api/v1/admin/media?sort=name&limit=2&page=2").set(headers);
    expect(page2.body.data.map((a: { fileName: string }) => a.fileName)).toEqual(["c.jpg"]);
    expect(page2.body.pagination).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect((await request(app).get("/api/v1/admin/media?limit=1000").set(headers)).status).toBe(400);
  });

  it("stats come from aggregates and agree with the list", async () => {
    const headers = await admin();
    await asset("POSTER", { sizeBytes: 100 });
    await asset("MOVIE_MASTER", { sizeBytes: 900, mimeType: "video/mp4" });
    await asset("AUDIOBOOK_FILE", { sizeBytes: 50, mimeType: "audio/mpeg", status: "FAILED" });
    const { body } = await request(app).get("/api/v1/admin/media/stats").set(headers);
    expect(body.data).toMatchObject({ total: 3, storageBytes: 1050, byCategory: { images: 1, videos: 1, audio: 1, documents: 0 }, byStatus: { READY: 2, FAILED: 1 }, unattached: 3 });
  });
});

describe("Media Library: upload (reuses the one upload system)", () => {
  it("library upload writes an organised R2 key, verifies it, and lands READY and unattached", async () => {
    const headers = await admin();
    const id = await uploadLibraryImage(headers);
    const detail = await request(app).get(`/api/v1/admin/media/${id}`).set(headers);
    expect(detail.body.data).toMatchObject({ type: "LIBRARY_IMAGE", status: "READY", width: 800, height: 1200, usedBy: [] });
    expect(detail.body.data.objectKey).toMatch(/^media\/images\/library\/[0-9a-f-]+\.jpg$/);
    expect(await getStorageProvider().objectExists(detail.body.data.objectKey)).toBe(true);
    const row = await db.mediaAsset.findUnique({ where: { id } });
    expect(row).toMatchObject({ contentId: null, status: "READY" });
  });

  it("rejects a non-library presign that has no content, and a bad MIME type", async () => {
    const headers = await admin();
    const noContent = await request(app).post("/api/v1/admin/uploads/presign").set(headers).send({ purpose: "POSTER", fileName: "p.jpg", mimeType: "image/jpeg", sizeBytes: 10 });
    expect(noContent.status).toBe(400);
    const badMime = await request(app).post("/api/v1/admin/uploads/presign").set(headers).send({ library: true, purpose: "LIBRARY_IMAGE", fileName: "x.zip", mimeType: "application/zip", sizeBytes: 10 });
    expect(badMime.status).toBe(400);
  });

  it("completing without uploading the bytes is refused (HEAD verification)", async () => {
    const headers = await admin();
    const presign = await request(app).post("/api/v1/admin/uploads/presign").set(headers).send({ library: true, purpose: "LIBRARY_IMAGE", fileName: "x.jpg", mimeType: "image/jpeg", sizeBytes: 10 });
    const done = await request(app).post(`/api/v1/admin/uploads/${presign.body.data.assetId}/complete`).set(headers).send({});
    expect(done.status).toBe(400);
  });
});

describe("Media Library: detail and metadata", () => {
  it("returns a short-lived preview, protected flag and Used By links, and never credentials", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie({ title: "Used Movie" });
    const poster = await asset("POSTER");
    const master = await asset("MOVIE_MASTER", { mimeType: "video/mp4" });
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: poster.id } }), NO_ACTOR);
    const p = (await request(app).get(`/api/v1/admin/media/${poster.id}`).set(headers)).body.data;
    expect(p.usedBy).toEqual([expect.objectContaining({ kind: "MOVIE", role: "Poster", title: "Used Movie", code: content.contentCode })]);
    expect(p.usedBy[0].href).toContain("/admin/movies/");
    expect(p).toMatchObject({ protected: false, previewKind: "image", previewExpiresInSeconds: 300 });
    const m = (await request(app).get(`/api/v1/admin/media/${master.id}`).set(headers)).body.data;
    expect(m).toMatchObject({ protected: true, previewKind: "video", publicUrl: null });
    expect(JSON.stringify(p)).not.toMatch(/secret|accessKey|AWS_/i);
    expect((await request(app).get("/api/v1/admin/media/nope").set(headers)).status).toBe(404);
  });

  it("edits display title, alt text, caption, notes and folder - but not MIME type or object key", async () => {
    const headers = await admin();
    const a = await asset("POSTER");
    const ok = await request(app).patch(`/api/v1/admin/media/${a.id}`).set(headers).send({ displayTitle: "Hero", altText: "A castle", caption: "Cap", notes: "internal", folder: "Marketing" });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ displayTitle: "Hero", altText: "A castle", caption: "Cap", notes: "internal", folder: "Marketing" });
    const bad = await request(app).patch(`/api/v1/admin/media/${a.id}`).set(headers).send({ mimeType: "text/html" });
    expect(bad.status).toBe(400);
    const bad2 = await request(app).patch(`/api/v1/admin/media/${a.id}`).set(headers).send({ storageKey: "x/y" });
    expect(bad2.status).toBe(400);
    const row = await db.mediaAsset.findUnique({ where: { id: a.id } });
    expect(row).toMatchObject({ mimeType: "image/jpeg", storageKey: a.storageKey });
  });
});

describe("Media Library: attach from the library, Used By, delete protection", () => {
  it("a library image fills a Movie poster without duplicating the R2 object; Media then shows Used By; delete is blocked", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie({ title: "Flow Movie" });
    const id = await uploadLibraryImage(headers, 600, 900);
    const before = (await db.mediaAsset.findUnique({ where: { id } }))!.storageKey as string;

    const updated = await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: id } }), NO_ACTOR);
    expect(updated.posterAssetId).toBe(id);
    expect((await db.mediaAsset.findUnique({ where: { id } }))!.storageKey).toBe(before); // same object, no copy

    const detail = (await request(app).get(`/api/v1/admin/media/${id}`).set(headers)).body.data;
    expect(detail.usedBy).toEqual([expect.objectContaining({ title: "Flow Movie", role: "Poster" })]);

    const del = await request(app).delete(`/api/v1/admin/media/${id}`).set(headers);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe("MEDIA_IN_USE");
    expect(JSON.stringify(del.body.errors)).toContain("Flow Movie");
    expect(await getStorageProvider().objectExists(before)).toBe(true);
    expect((await db.mediaAsset.findUnique({ where: { id } }))!.deletedAt).toBeNull();
  });

  it("the same library image can serve two titles, and is not retired when one stops using it", async () => {
    const headers = await admin();
    const { content: a } = await makeDraftMovie({ title: "A" });
    const { content: b } = await makeDraftMovie({ title: "B" });
    const id = await uploadLibraryImage(headers, 600, 900);
    await updateMovie(a.id, updateMovieSchema.parse({ movie: { posterAssetId: id } }), NO_ACTOR);
    await updateMovie(b.id, updateMovieSchema.parse({ movie: { posterAssetId: id } }), NO_ACTOR);
    const detail = (await request(app).get(`/api/v1/admin/media/${id}`).set(headers)).body.data;
    expect(detail.usedBy).toHaveLength(2);
    const other = await uploadLibraryImage(headers, 600, 900, "other.jpg");
    await updateMovie(a.id, updateMovieSchema.parse({ movie: { posterAssetId: other } }), NO_ACTOR);
    expect((await db.mediaAsset.findUnique({ where: { id } }))!.deletedAt).toBeNull();
  });

  it("enforces slot rules on the backend: a library image that is too small for a Movie poster is refused", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const tiny = await uploadLibraryImage(headers, 100, 100, "tiny.jpg");
    const res = await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: tiny } }), NO_ACTOR).catch((e) => e);
    expect((res as { statusCode?: number }).statusCode).toBe(400);
  });

  it("a video cannot be used as a poster", async () => {
    const { content } = await makeDraftMovie();
    const v = await asset("MOVIE_MASTER", { mimeType: "video/mp4" });
    const res = await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: v.id } }), NO_ACTOR).catch((e) => e);
    expect((res as { statusCode?: number }).statusCode).toBe(400);
  });

  it("deleting an unattached asset removes the R2 object first, then marks the row deleted", async () => {
    const headers = await admin();
    const a = await asset("POSTER");
    const del = await request(app).delete(`/api/v1/admin/media/${a.id}`).set(headers);
    expect(del.status).toBe(200);
    expect(await getStorageProvider().objectExists(a.storageKey!)).toBe(false);
    expect(await db.mediaAsset.findUnique({ where: { id: a.id } })).toMatchObject({ status: "DELETED" });
    const list = await request(app).get("/api/v1/admin/media").set(headers);
    expect(list.body.data).toHaveLength(0);
  });

  it("if storage refuses the delete, the file is still hidden from the library and left for the cleanup job", async () => {
    const headers = await admin();
    const a = await asset("POSTER");
    const storage = getStorageProvider();
    const spy = vi.spyOn(storage, "deleteObject").mockRejectedValueOnce(new Error("R2 down"));
    const del = await request(app).delete(`/api/v1/admin/media/${a.id}`).set(headers);
    spy.mockRestore();
    expect(del.status).toBe(200);
    // never a row that is listed while its file is gone: the row is DELETED, and the cleanup job retries the object later
    expect(await db.mediaAsset.findUnique({ where: { id: a.id } })).toMatchObject({ status: "DELETED" });
    expect(await getStorageProvider().objectExists(a.storageKey!)).toBe(true);
    const list = await request(app).get("/api/v1/admin/media").set(headers);
    expect(list.body.data).toHaveLength(0);
  });

  it("bulk delete removes unattached files and reports the blocked ones", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const used = await asset("POSTER");
    const free = await asset("POSTER");
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: used.id } }), NO_ACTOR);
    const res = await request(app).post("/api/v1/admin/media/bulk-delete").set(headers).send({ ids: [used.id, free.id] });
    expect(res.body.data).toMatchObject({ deleted: 1, blocked: 1 });
    expect(res.body.data.results.find((r: { id: string }) => r.id === used.id)).toMatchObject({ deleted: false });
  });
});

describe("Media Library: replace", () => {
  it("swaps every reference to the new file, keeps the old object until cleanup, and updates Used By", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie({ title: "Swap Movie" });
    const oldId = await uploadLibraryImage(headers, 600, 900, "old.jpg");
    const newId = await uploadLibraryImage(headers, 700, 1000, "new.jpg");
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: oldId } }), NO_ACTOR);
    const oldKey = (await db.mediaAsset.findUnique({ where: { id: oldId } }))!.storageKey as string;

    const res = await request(app).post(`/api/v1/admin/media/${oldId}/replace`).set(headers).send({ newAssetId: newId });
    expect(res.status).toBe(200);
    expect(res.body.data.referencesMoved).toBe(1);
    expect(res.body.data.asset.usedBy).toEqual([expect.objectContaining({ title: "Swap Movie", role: "Poster" })]);
    expect(await getStorageProvider().objectExists(oldKey)).toBe(true); // never deleted first
    expect(await db.mediaAsset.findUnique({ where: { id: oldId } })).toMatchObject({ status: "DELETED" });
  });

  it("refuses a different kind of file, an unready file, and replacing a file with itself", async () => {
    const headers = await admin();
    const a = await asset("POSTER");
    const video = await asset("MOVIE_MASTER", { mimeType: "video/mp4" });
    const pending = await asset("POSTER", { status: "UPLOADING" });
    expect((await request(app).post(`/api/v1/admin/media/${a.id}/replace`).set(headers).send({ newAssetId: video.id })).status).toBe(400);
    expect((await request(app).post(`/api/v1/admin/media/${a.id}/replace`).set(headers).send({ newAssetId: pending.id })).status).toBe(400);
    expect((await request(app).post(`/api/v1/admin/media/${a.id}/replace`).set(headers).send({ newAssetId: a.id })).status).toBe(400);
  });

  it("refuses a replacement that is too small for the slot it would fill", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const oldId = await uploadLibraryImage(headers, 600, 900);
    const tiny = await uploadLibraryImage(headers, 120, 120, "tiny.jpg");
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: oldId } }), NO_ACTOR);
    expect((await request(app).post(`/api/v1/admin/media/${oldId}/replace`).set(headers).send({ newAssetId: tiny })).status).toBe(400);
    expect(((await db.mediaAsset.findUnique({ where: { id: oldId } })) as { deletedAt: unknown }).deletedAt).toBeNull();
  });
});

describe("Media Library: reconciliation (report only)", () => {
  it("reports DB rows whose object is gone and bucket objects with no row, and changes/deletes nothing", async () => {
    const headers = await admin();
    const ok = await asset("POSTER");
    const gone = await asset("POSTER", {}, false); // row exists, object does not
    // the bucket listing is stubbed so the shared scratch directory (other test files write there too) cannot interfere
    const storage = getStorageProvider();
    const spy = vi.spyOn(storage, "listObjects").mockImplementation(async (prefix) => ({ objects: prefix === "media/" ? [{ key: "media/images/library/stray.jpg", sizeBytes: 2 }, { key: ok.storageKey!, sizeBytes: 1 }] : [] }));
    await storage.putObject("media/images/library/stray.jpg", Buffer.from("zz"), "image/jpeg");
    const res = await request(app).post("/api/v1/admin/media/reconcile").set(headers).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.missing.map((m: { id: string }) => m.id)).toEqual([gone.id]);
    expect(res.body.data.orphans.map((o: { key: string }) => o.key)).toContain("media/images/library/stray.jpg");
    expect(res.body.data.orphans.map((o: { key: string }) => o.key)).not.toContain(ok.storageKey);
    // nothing was changed or deleted
    expect(await db.mediaAsset.findUnique({ where: { id: gone.id } })).toMatchObject({ status: "READY" });
    spy.mockRestore();
    expect(await getStorageProvider().objectExists("media/images/library/stray.jpg")).toBe(true);
  });
});

describe("Media Library: banner and collection images", () => {
  it("a wide library image fills a banner and a collection (one stored object, two users); a too-small one is refused", async () => {
    const headers = await admin();
    const wide = await uploadLibraryImage(headers, 1400, 500, "wide.jpg");
    const small = await uploadLibraryImage(headers, 300, 100, "small.jpg");

    const banner = await request(app).post("/api/v1/admin/banners").set(headers).send({ type: "NORMAL", title: "B", desktopAssetId: wide });
    expect(banner.status).toBe(201);
    const collection = await request(app).post("/api/v1/admin/collections").set(headers).send({ name: "C", bannerAssetId: wide });
    expect(collection.status).toBe(201);
    const usedBy = (await request(app).get(`/api/v1/admin/media/${wide}`).set(headers)).body.data.usedBy;
    expect(usedBy.map((u: { kind: string }) => u.kind).sort()).toEqual(["BANNER", "COLLECTION"]);

    expect((await request(app).post("/api/v1/admin/banners").set(headers).send({ type: "NORMAL", title: "B2", desktopAssetId: small })).status).toBe(400);
    expect((await request(app).post("/api/v1/admin/collections").set(headers).send({ name: "C2", bannerAssetId: small })).status).toBe(400);
  });

  it("a hero banner needs the bigger hero size, and a library image can be detached again", async () => {
    const headers = await admin();
    const mid = await uploadLibraryImage(headers, 1400, 500, "mid.jpg");
    expect((await request(app).post("/api/v1/admin/banners").set(headers).send({ type: "HERO", title: "Hero", desktopAssetId: mid })).status).toBe(400);

    const col = await request(app).post("/api/v1/admin/collections").set(headers).send({ name: "Detach", bannerAssetId: mid });
    expect((await request(app).delete(`/api/v1/admin/media/${mid}`).set(headers)).status).toBe(409);
    const detached = await request(app).put(`/api/v1/admin/collections/${col.body.data.id}`).set(headers).send({ bannerAssetId: null });
    expect(detached.status).toBe(200);
    expect((await request(app).delete(`/api/v1/admin/media/${mid}`).set(headers)).status).toBe(200);
  });

  it("deleting a title stops it from protecting its files", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie({ title: "Soon gone" });
    const id = await uploadLibraryImage(headers, 600, 900);
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: id } }), NO_ACTOR);
    expect((await request(app).delete(`/api/v1/admin/media/${id}`).set(headers)).status).toBe(409);
    await request(app).delete(`/api/v1/admin/movies/${content.id}`).set(headers).send({});
    expect((await request(app).delete(`/api/v1/admin/media/${id}`).set(headers)).status).toBe(200);
  });
});
