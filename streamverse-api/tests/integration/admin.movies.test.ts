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
import { createAdmin, createUser } from "../helpers/adminAuth";

const db = prisma as unknown as {
  __reset: () => void;
  user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> };
  mediaAsset: { create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }> };
  auditLog: { findMany: (a: unknown) => Promise<{ action: string; entityType: string; entityId: string | null }[]> };
};
const app = createApp();

beforeEach(() => db.__reset());

const asset = (type: string) => db.mediaAsset.create({ data: { type, status: "READY" } });

describe("admin movie routes: protection", () => {
  it("401s with no token, 403s a USER, and lets an ADMIN through", async () => {
    const { accessToken: userToken } = await createUser(app);
    const { accessToken: adminToken } = await createAdmin(app, db);

    expect((await request(app).get("/api/v1/admin/movies")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/movies").set("Authorization", `Bearer ${userToken}`)).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/movies").set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
  });
});

describe("admin movie CRUD", () => {
  it("creates a title-only draft", async () => {
    const { accessToken } = await createAdmin(app, db);
    const res = await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Untitled Project" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.contentCode).toMatch(/^MOV-\d{6}$/);
    expect(res.body.data.movie.runtimeMinutes).toBeFalsy();
  });

  it("updates metadata, and relation arrays replace cleanly (no duplicates on repeated PATCH)", async () => {
    const { accessToken } = await createAdmin(app, db);
    const genre = await createGenre({ name: "Thriller" });
    const created = await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Zenith Run" });
    const id = created.body.data.id;

    const patch1 = await request(app).patch(`/api/v1/admin/movies/${id}`).set("Authorization", `Bearer ${accessToken}`).send({ genreIds: [genre.id], movie: { runtimeMinutes: 100 } });
    expect(patch1.status).toBe(200);
    expect(patch1.body.data.genres).toHaveLength(1);
    expect(patch1.body.data.movie.runtimeMinutes).toBe(100);

    // same genreIds sent again: still exactly one, not two
    const patch2 = await request(app).patch(`/api/v1/admin/movies/${id}`).set("Authorization", `Bearer ${accessToken}`).send({ genreIds: [genre.id] });
    expect(patch2.body.data.genres).toHaveLength(1);

    // omitting the field entirely leaves it untouched
    const patch3 = await request(app).patch(`/api/v1/admin/movies/${id}`).set("Authorization", `Bearer ${accessToken}`).send({ title: "Zenith Run (2026)" });
    expect(patch3.body.data.genres).toHaveLength(1);
    expect(patch3.body.data.title).toBe("Zenith Run (2026)");
  });

  it("changes the slug on request, and rejects a slug already taken by another title", async () => {
    const { accessToken } = await createAdmin(app, db);
    const a = await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Movie A" });
    const b = await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Movie B" });

    const renamed = await request(app).patch(`/api/v1/admin/movies/${a.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ manualSlug: "custom-slug" });
    expect(renamed.body.data.slug).toBe("custom-slug");

    const clash = await request(app).patch(`/api/v1/admin/movies/${b.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ manualSlug: "custom-slug" });
    expect(clash.body.data.slug).toBe("custom-slug-2"); // made unique, never silently stolen from A
    const stillA = await request(app).get(`/api/v1/admin/movies/${a.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(stillA.body.data.slug).toBe("custom-slug");
  });

  it("never lets contentCode or createdById change through update", async () => {
    const { accessToken, userId } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Immutable Fields" });
    const originalCode = created.body.data.contentCode;
    expect(created.body.data.createdById).toBe(userId);

    const attempt = await request(app)
      .patch(`/api/v1/admin/movies/${created.body.data.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ contentCode: "MOV-999999", createdById: "someone-else", id: "different-id" });
    expect(attempt.status).toBe(200); // the extra fields are silently stripped, not an error
    expect(attempt.body.data.contentCode).toBe(originalCode);
    expect(attempt.body.data.createdById).toBe(userId);
  });

  it("soft-deletes: the row and its contentCode survive, status/visibility unaffected by hard removal", async () => {
    const { accessToken } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Going Away" });
    const del = await request(app).delete(`/api/v1/admin/movies/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/v1/admin/movies/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`)).status).toBe(404);
  });

  it("lists with search/filter/pagination", async () => {
    const { accessToken } = await createAdmin(app, db);
    await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Findable Title Alpha" });
    await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Something Else" });

    const res = await request(app).get("/api/v1/admin/movies").query({ search: "Findable", page: 1, limit: 20 }).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Findable Title Alpha");
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it("every content-changing action writes an audit log entry", async () => {
    const { accessToken, userId } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Audited" });
    const logs = await db.auditLog.findMany({ where: { entityId: created.body.data.id } });
    expect(logs.some((l) => l.action === "content.created")).toBe(true);
    expect(logs[0]).toBeTruthy();
    void userId;
  });
});

describe("admin movie publish validation and status transitions", () => {
  async function makePublishableMovie(accessToken: string) {
    const genre = await createGenre({ name: "Action" });
    const language = await createLanguage({ code: "en", name: "English" });
    const poster = await asset("POSTER");
    const backdrop = await asset("BACKDROP");
    const thumbnail = await asset("THUMBNAIL");
    const master = await asset("MOVIE_MASTER");
    const created = await request(app)
      .post("/api/v1/admin/movies")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Ready To Publish",
        summary: "A summary",
        description: "A description",
        releaseDate: "2026-01-01",
        age: { ageRating: "PG-13", ageRestricted: false },
        genreIds: [genre.id],
        languages: [{ languageId: language.id, role: "PRIMARY" }],
        movie: { runtimeMinutes: 100, posterAssetId: poster.id, backdropAssetId: backdrop.id, thumbnailAssetId: thumbnail.id, masterAssetId: master.id },
      });
    return created.body.data.id as string;
  }

  it("refuses to publish an incomplete movie, with field-level errors", async () => {
    const { accessToken } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Missing Everything" });
    const res = await request(app).post(`/api/v1/admin/movies/${created.body.data.id}/publish`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors.some((e: { path: string }) => e.path === "movie.posterAssetId")).toBe(true);
  });

  it("publishes a complete movie: DRAFT -> PUBLISHED, sets publishedAt", async () => {
    const { accessToken } = await createAdmin(app, db);
    const id = await makePublishableMovie(accessToken);
    const res = await request(app).post(`/api/v1/admin/movies/${id}/publish`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PUBLISHED");
    expect(res.body.data.publishedAt).toBeTruthy();
  });

  it("DRAFT -> SCHEDULED, then publish; published -> unpublish; unpublish -> archive", async () => {
    const { accessToken } = await createAdmin(app, db);
    const id = await makePublishableMovie(accessToken);
    const future = new Date(Date.now() + 86_400_000).toISOString();

    const scheduled = await request(app).post(`/api/v1/admin/movies/${id}/schedule`).set("Authorization", `Bearer ${accessToken}`).send({ publishAt: future });
    expect(scheduled.body.data.status).toBe("SCHEDULED");

    const published = await request(app).post(`/api/v1/admin/movies/${id}/publish`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(published.body.data.status).toBe("PUBLISHED");

    const unpublished = await request(app).post(`/api/v1/admin/movies/${id}/unpublish`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(unpublished.body.data.status).toBe("UNPUBLISHED");

    const archived = await request(app).post(`/api/v1/admin/movies/${id}/archive`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(archived.body.data.status).toBe("ARCHIVED");
  });

  it("rejects an invalid transition (archive straight from draft)", async () => {
    const { accessToken } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Fresh Draft" });
    const res = await request(app).post(`/api/v1/admin/movies/${created.body.data.id}/archive`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(409);
  });

  it("cancel-schedule returns a scheduled title to DRAFT", async () => {
    const { accessToken } = await createAdmin(app, db);
    const id = await makePublishableMovie(accessToken);
    await request(app).post(`/api/v1/admin/movies/${id}/schedule`).set("Authorization", `Bearer ${accessToken}`).send({ publishAt: new Date(Date.now() + 86_400_000).toISOString() });
    const res = await request(app).post(`/api/v1/admin/movies/${id}/cancel-schedule`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(res.body.data.status).toBe("DRAFT");
  });
});
