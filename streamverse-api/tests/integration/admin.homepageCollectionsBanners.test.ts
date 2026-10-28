import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createMovie } from "../../src/services/movie.service";
import { createMovieSchema } from "../../src/validators/movie.validator";
import { createAdmin } from "../helpers/adminAuth";

const db = prisma as unknown as { __reset: () => void; user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> } };
const app = createApp();

beforeEach(() => db.__reset());

async function makeContent(title: string) {
  const { content } = await createMovie(createMovieSchema.parse({ title }));
  return content.id as string;
}

describe("admin homepage CMS", () => {
  it("renaming displayTitle never changes key", async () => {
    const { accessToken } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/homepage/sections").set("Authorization", `Bearer ${accessToken}`).send({ key: "trending_movies", displayTitle: "Trending Now", type: "TRENDING", contentType: "MOVIE" });
    expect(created.status).toBe(201);
    const res = await request(app).put(`/api/v1/admin/homepage/sections/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ displayTitle: "What's Hot" });
    expect(res.body.data.key).toBe("trending_movies");
    expect(res.body.data.displayTitle).toBe("What's Hot");
  });

  it("rejects a duplicate key", async () => {
    const { accessToken } = await createAdmin(app, db);
    await request(app).post("/api/v1/admin/homepage/sections").set("Authorization", `Bearer ${accessToken}`).send({ key: "featured", displayTitle: "Featured", type: "FEATURED", contentType: "MOVIE" });
    const dupe = await request(app).post("/api/v1/admin/homepage/sections").set("Authorization", `Bearer ${accessToken}`).send({ key: "featured", displayTitle: "Featured Again", type: "FEATURED", contentType: "MOVIE" });
    expect(dupe.status).toBe(409);
  });

  it("reorders sections", async () => {
    const { accessToken } = await createAdmin(app, db);
    const a = await request(app).post("/api/v1/admin/homepage/sections").set("Authorization", `Bearer ${accessToken}`).send({ key: "a_section", displayTitle: "A", type: "MANUAL" });
    const b = await request(app).post("/api/v1/admin/homepage/sections").set("Authorization", `Bearer ${accessToken}`).send({ key: "b_section", displayTitle: "B", type: "MANUAL" });
    const res = await request(app)
      .put("/api/v1/admin/homepage/sections/reorder")
      .set("Authorization", `Bearer ${accessToken}`)
      .send([{ id: b.body.data.id, displayOrder: 0 }, { id: a.body.data.id, displayOrder: 1 }]);
    expect(res.status).toBe(200);
  });

  it("selects content, prevents a duplicate, and removes it", async () => {
    const { accessToken } = await createAdmin(app, db);
    const contentId = await makeContent("Homepage Title");
    const section = await request(app).post("/api/v1/admin/homepage/sections").set("Authorization", `Bearer ${accessToken}`).send({ key: "manual_section", displayTitle: "Manual", type: "MANUAL" });
    const sectionId = section.body.data.id;

    const added = await request(app).post(`/api/v1/admin/homepage/sections/${sectionId}/items`).set("Authorization", `Bearer ${accessToken}`).send({ contentId });
    expect(added.status).toBe(201);

    const dupe = await request(app).post(`/api/v1/admin/homepage/sections/${sectionId}/items`).set("Authorization", `Bearer ${accessToken}`).send({ contentId });
    expect(dupe.status).toBe(409);

    const removed = await request(app).delete(`/api/v1/admin/homepage/sections/${sectionId}/items/${contentId}`).set("Authorization", `Bearer ${accessToken}`);
    expect(removed.status).toBe(200);
    const items = await request(app).get(`/api/v1/admin/homepage/sections/${sectionId}/items`).set("Authorization", `Bearer ${accessToken}`);
    expect(items.body.data).toHaveLength(0);
  });
});

describe("admin collections", () => {
  it("full CRUD, slug uniqueness, items add/remove/reorder, duplicate prevention", async () => {
    const { accessToken } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/collections").set("Authorization", `Bearer ${accessToken}`).send({ name: "Award Winners" });
    expect(created.status).toBe(201);
    expect(created.body.data.slug).toBe("award-winners");

    const dupeSlug = await request(app).post("/api/v1/admin/collections").set("Authorization", `Bearer ${accessToken}`).send({ name: "Award Winners" });
    expect(dupeSlug.body.data.slug).toBe("award-winners-2");

    const updated = await request(app).put(`/api/v1/admin/collections/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ status: "PUBLISHED" });
    expect(updated.body.data.status).toBe("PUBLISHED");

    const contentId = await makeContent("Collected Movie");
    const addItem = await request(app).post(`/api/v1/admin/collections/${created.body.data.id}/items`).set("Authorization", `Bearer ${accessToken}`).send({ contentId });
    expect(addItem.status).toBe(201);
    const dupeItem = await request(app).post(`/api/v1/admin/collections/${created.body.data.id}/items`).set("Authorization", `Bearer ${accessToken}`).send({ contentId });
    expect(dupeItem.status).toBe(409);

    const reorder = await request(app).put(`/api/v1/admin/collections/${created.body.data.id}/items/reorder`).set("Authorization", `Bearer ${accessToken}`).send([{ contentId, displayOrder: 5 }]);
    expect(reorder.status).toBe(200);

    const removeItem = await request(app).delete(`/api/v1/admin/collections/${created.body.data.id}/items/${contentId}`).set("Authorization", `Bearer ${accessToken}`);
    expect(removeItem.status).toBe(200);

    const del = await request(app).delete(`/api/v1/admin/collections/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/v1/admin/collections/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(after.body.data.status).toBe("ARCHIVED"); // "deleted" = archived, never actually removed
  });
});

describe("admin banners", () => {
  it("CRUD, linked content, start/end validation, priority, active state", async () => {
    const { accessToken } = await createAdmin(app, db);
    const contentId = await makeContent("Banner Target");

    const badDates = await request(app)
      .post("/api/v1/admin/banners")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ type: "HERO", placement: "MOVIES", title: "Bad Dates", startsAt: "2026-06-01", endsAt: "2026-01-01" });
    expect(badDates.status).toBe(400);

    const created = await request(app).post("/api/v1/admin/banners").set("Authorization", `Bearer ${accessToken}`).send({ type: "HERO", placement: "MOVIES", title: "Crimson Horizon", linkedContentId: contentId, priority: 1, active: true });
    expect(created.status).toBe(201);
    expect(created.body.data.linkedContent.id).toBe(contentId);

    // a hero banner must say which sub-page it leads; the homepage hero is managed in Homepage settings
    expect((await request(app).post("/api/v1/admin/banners").set("Authorization", `Bearer ${accessToken}`).send({ type: "HERO", title: "No page" })).status).toBe(400);
    const badLink = await request(app).post("/api/v1/admin/banners").set("Authorization", `Bearer ${accessToken}`).send({ type: "HERO", placement: "MOVIES", title: "Broken Link", linkedContentId: "does-not-exist" });
    expect(badLink.status).toBe(400);

    const deactivated = await request(app).put(`/api/v1/admin/banners/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`).send({ active: false });
    expect(deactivated.body.data.active).toBe(false);

    const del = await request(app).delete(`/api/v1/admin/banners/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/v1/admin/banners/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`)).status).toBe(404);
  });

  it("a content slug change does not break the banner's link", async () => {
    const { accessToken } = await createAdmin(app, db);
    const contentId = await makeContent("Original Title");
    const created = await request(app).post("/api/v1/admin/banners").set("Authorization", `Bearer ${accessToken}`).send({ type: "NORMAL", title: "Linked Banner", linkedContentId: contentId });

    await request(app).patch(`/api/v1/admin/movies/${contentId}`).set("Authorization", `Bearer ${accessToken}`).send({ manualSlug: "brand-new-slug" });

    const res = await request(app).get(`/api/v1/admin/banners/${created.body.data.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.body.data.linkedContent.slug).toBe("brand-new-slug");
    expect(res.body.data.linkedContent.id).toBe(contentId);
  });
});
