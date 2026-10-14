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

describe("admin audiobook CRUD", () => {
  it("creates a title-only draft", async () => {
    const { accessToken } = await createAdmin(app, db);
    const res = await request(app).post("/api/v1/admin/audiobooks").set("Authorization", `Bearer ${accessToken}`).send({ title: "Untitled Audio" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.contentCode).toMatch(/^AUD-\d{6}$/);
    expect(res.body.data.audiobook.durationSeconds).toBeFalsy();
  });

  it("single-file mode: updates metadata and a main asset reference", async () => {
    const { accessToken } = await createAdmin(app, db);
    const main = await asset("AUDIOBOOK_FILE");
    const created = await request(app).post("/api/v1/admin/audiobooks").set("Authorization", `Bearer ${accessToken}`).send({ title: "Single File Book" });
    const res = await request(app)
      .patch(`/api/v1/admin/audiobooks/${created.body.data.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ audiobook: { narrator: "Kemal Ross", deliveryMode: "SINGLE_FILE", mainAssetId: main.id } });
    expect(res.status).toBe(200);
    expect(res.body.data.audiobook.deliveryMode).toBe("SINGLE_FILE");
    expect(res.body.data.audiobook.mainAssetId).toBe(main.id);
  });

  it("chapter mode: switching deliveryMode is just a metadata update", async () => {
    const { accessToken } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/audiobooks").set("Authorization", `Bearer ${accessToken}`).send({ title: "Chaptered Book" });
    const res = await request(app).patch(`/api/v1/admin/audiobooks/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ audiobook: { deliveryMode: "CHAPTER_FILES" } });
    expect(res.body.data.audiobook.deliveryMode).toBe("CHAPTER_FILES");
  });
});

describe("admin audiobook chapters", () => {
  it("adds, updates, deletes and reorders chapters", async () => {
    const { accessToken } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/audiobooks").set("Authorization", `Bearer ${accessToken}`).send({ title: "Serial", audiobook: { deliveryMode: "CHAPTER_FILES" } });
    const id = created.body.data.id;

    const ch1 = await request(app).post(`/api/v1/admin/audiobooks/${id}/chapters`).set("Authorization", `Bearer ${accessToken}`).send({ chapterNumber: 1, title: "Beginnings" });
    expect(ch1.status).toBe(201);
    const ch2 = await request(app).post(`/api/v1/admin/audiobooks/${id}/chapters`).set("Authorization", `Bearer ${accessToken}`).send({ chapterNumber: 2, title: "Middles" });
    expect(ch2.status).toBe(201);

    const dupe = await request(app).post(`/api/v1/admin/audiobooks/${id}/chapters`).set("Authorization", `Bearer ${accessToken}`).send({ chapterNumber: 1, title: "Clash" });
    expect(dupe.status).toBe(409);

    const updated = await request(app).put(`/api/v1/admin/audiobooks/${id}/chapters/${ch1.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ title: "Beginnings, Revised" });
    expect(updated.body.data.title).toBe("Beginnings, Revised");

    const reordered = await request(app)
      .put(`/api/v1/admin/audiobooks/${id}/chapters/reorder`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send([{ id: ch2.body.data.id, displayOrder: 0 }, { id: ch1.body.data.id, displayOrder: 1 }]);
    expect(reordered.status).toBe(200);

    const del = await request(app).delete(`/api/v1/admin/audiobooks/${id}/chapters/${ch2.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(del.status).toBe(200);
    const full = await request(app).get(`/api/v1/admin/audiobooks/${id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(full.body.data.chapters).toHaveLength(1);
  });
});

describe("admin audiobook language editions", () => {
  it("adds a narrator edition for another language", async () => {
    const { accessToken } = await createAdmin(app, db);
    const es = await createLanguage({ code: "es", name: "Spanish" });
    const created = await request(app).post("/api/v1/admin/audiobooks").set("Authorization", `Bearer ${accessToken}`).send({ title: "Multilingual Audio" });
    const res = await request(app).post(`/api/v1/admin/audiobooks/${created.body.data.id}/editions`).set("Authorization", `Bearer ${accessToken}`).send({ languageId: es.id, narrator: "Elena Cruz" });
    expect(res.status).toBe(201);
    expect(res.body.data.narrator).toBe("Elena Cruz");
  });
});

describe("admin audiobook publish validation", () => {
  it("fails without an audio source", async () => {
    const { accessToken } = await createAdmin(app, db);
    const genre = await createGenre({ name: "Memoir" });
    const language = await createLanguage({ code: "en", name: "English" });
    const cover = await asset("AUDIOBOOK_COVER");
    const thumbnail = await asset("THUMBNAIL");
    const created = await request(app)
      .post("/api/v1/admin/audiobooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "No Audio Yet",
        summary: "s",
        description: "d",
        genreIds: [genre.id],
        languages: [{ languageId: language.id, role: "PRIMARY" }],
        audiobook: { author: "Someone", narrator: "Someone Else", coverAssetId: cover.id, thumbnailAssetId: thumbnail.id },
      });
    const res = await request(app).post(`/api/v1/admin/audiobooks/${created.body.data.id}/publish`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: { path: string }) => e.path === "audiobook.mainAssetId")).toBe(true);
  });

  it("succeeds with a valid single-file source", async () => {
    const { accessToken } = await createAdmin(app, db);
    const genre = await createGenre({ name: "Memoir" });
    const language = await createLanguage({ code: "en", name: "English" });
    const main = await asset("AUDIOBOOK_FILE");
    const cover = await asset("AUDIOBOOK_COVER");
    const thumbnail = await asset("THUMBNAIL");
    const created = await request(app)
      .post("/api/v1/admin/audiobooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Has Audio",
        summary: "s",
        description: "d",
        genreIds: [genre.id],
        languages: [{ languageId: language.id, role: "PRIMARY" }],
        audiobook: { author: "Someone", narrator: "Someone Else", mainAssetId: main.id, coverAssetId: cover.id, thumbnailAssetId: thumbnail.id },
      });
    const res = await request(app).post(`/api/v1/admin/audiobooks/${created.body.data.id}/publish`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PUBLISHED");
  });
});
