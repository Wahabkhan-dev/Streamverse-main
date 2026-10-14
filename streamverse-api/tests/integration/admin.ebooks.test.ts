import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createGenre } from "../../src/services/genre.service";
import { createLanguage } from "../../src/services/language.service";
import { createAdmin } from "../helpers/adminAuth";

const db = prisma as unknown as {
  __reset: () => void;
  user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> };
  mediaAsset: { create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }> };
};
const app = createApp();
const asset = (type: string) => db.mediaAsset.create({ data: { type, status: "READY" } });

beforeEach(() => db.__reset());

describe("admin ebook CRUD", () => {
  it("creates a title-only draft, and does not require EPUB/PDF to exist as a draft", async () => {
    const { accessToken } = await createAdmin(app, db);
    const res = await request(app).post("/api/v1/admin/ebooks").set("Authorization", `Bearer ${accessToken}`).send({ title: "Untitled Manuscript" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.contentCode).toMatch(/^EBK-\d{6}$/);
  });

  it("updates metadata", async () => {
    const { accessToken } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/ebooks").set("Authorization", `Bearer ${accessToken}`).send({ title: "Draft Book" });
    const res = await request(app).patch(`/api/v1/admin/ebooks/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ ebook: { author: "Odile Maren", isbn: "978-0-00-000000-0" } });
    expect(res.status).toBe(200);
    expect(res.body.data.ebook.author).toBe("Odile Maren");
  });
});

describe("admin ebook editions", () => {
  it("adds, updates and deletes a translated edition", async () => {
    const { accessToken } = await createAdmin(app, db);
    const es = await createLanguage({ code: "es", name: "Spanish" });
    const created = await request(app).post("/api/v1/admin/ebooks").set("Authorization", `Bearer ${accessToken}`).send({ title: "Original" });
    const id = created.body.data.id;

    const added = await request(app).post(`/api/v1/admin/ebooks/${id}/editions`).set("Authorization", `Bearer ${accessToken}`).send({ languageId: es.id, translatedTitle: "El Original" });
    expect(added.status).toBe(201);
    const editionId = added.body.data.id;

    const updated = await request(app).put(`/api/v1/admin/ebooks/${id}/editions/${editionId}`).set("Authorization", `Bearer ${accessToken}`).send({ translator: "A. Traductor" });
    expect(updated.body.data.translator).toBe("A. Traductor");

    const del = await request(app).delete(`/api/v1/admin/ebooks/${id}/editions/${editionId}`).set("Authorization", `Bearer ${accessToken}`);
    expect(del.status).toBe(200);
    const full = await request(app).get(`/api/v1/admin/ebooks/${id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(full.body.data.editions).toHaveLength(0);
  });
});

describe("admin ebook publish validation", () => {
  async function basePayload(genreId: string, languageId: string) {
    return { title: "Publishable Book", summary: "s", description: "d", genreIds: [genreId], languages: [{ languageId, role: "PRIMARY" }], ebook: { author: "Someone" } };
  }

  it("fails without an EPUB or PDF file", async () => {
    const { accessToken } = await createAdmin(app, db);
    const genre = await createGenre({ name: "Fiction" });
    const language = await createLanguage({ code: "en", name: "English" });
    const frontCover = await asset("EBOOK_FRONT_COVER");
    const thumbnail = await asset("THUMBNAIL");
    const created = await request(app)
      .post("/api/v1/admin/ebooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...(await basePayload(genre.id, language.id)), ebook: { author: "Someone", frontCoverAssetId: frontCover.id, thumbnailAssetId: thumbnail.id } });
    const res = await request(app).post(`/api/v1/admin/ebooks/${created.body.data.id}/publish`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: { path: string }) => e.path === "ebook.epubAssetId")).toBe(true);
  });

  it("succeeds with one file (EPUB) plus the rest of the requirements", async () => {
    const { accessToken } = await createAdmin(app, db);
    const genre = await createGenre({ name: "Fiction" });
    const language = await createLanguage({ code: "en", name: "English" });
    const epub = await asset("EBOOK_EPUB");
    const frontCover = await asset("EBOOK_FRONT_COVER");
    const thumbnail = await asset("THUMBNAIL");
    const created = await request(app)
      .post("/api/v1/admin/ebooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...(await basePayload(genre.id, language.id)), ebook: { author: "Someone", epubAssetId: epub.id, frontCoverAssetId: frontCover.id, thumbnailAssetId: thumbnail.id } });
    const res = await request(app).post(`/api/v1/admin/ebooks/${created.body.data.id}/publish`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PUBLISHED");
  });
});
