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

const makeContent = async (title: string) => (await createMovie(createMovieSchema.parse({ title }))).content.id as string;

/** Admin -> Homepage: switching a section between Automatic and Manual, and keeping the titles picked for it. */
describe("homepage section: Automatic <-> Manual is saved", () => {
  it("a section switched to Manual keeps its picked titles, in order, and the admin list shows them", async () => {
    const { accessToken } = await createAdmin(app, db);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const a = await makeContent("Alpha");
    const b = await makeContent("Beta");
    const created = await request(app).post("/api/v1/admin/homepage/sections").set(auth).send({ key: "trending_now", displayTitle: "Trending", type: "TRENDING", contentType: "MOVIE", itemLimit: 12 });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    // 1. Automatic: nothing picked
    let list = await request(app).get("/api/v1/admin/homepage/sections").set(auth);
    expect(list.body.data.find((s: { id: string }) => s.id === id)).toMatchObject({ type: "TRENDING", items: [] });

    // 2. switch to Manual and pick two titles (what Save does)
    expect((await request(app).put(`/api/v1/admin/homepage/sections/${id}`).set(auth).send({ type: "MANUAL" })).status).toBe(200);
    expect((await request(app).post(`/api/v1/admin/homepage/sections/${id}/items`).set(auth).send({ contentId: b, displayOrder: 0 })).status).toBe(201);
    expect((await request(app).post(`/api/v1/admin/homepage/sections/${id}/items`).set(auth).send({ contentId: a, displayOrder: 1 })).status).toBe(201);

    // 3. reload: still Manual, with exactly those titles in the order picked (Beta first)
    list = await request(app).get("/api/v1/admin/homepage/sections").set(auth);
    const section = list.body.data.find((s: { id: string }) => s.id === id);
    expect(section.type).toBe("MANUAL");
    expect(section.items.map((i: { title: string }) => i.title)).toEqual(["Beta", "Alpha"]);
    expect(section.items[0]).toMatchObject({ contentId: b, contentType: "movie", slug: expect.any(String), movie: { id: b } });

    // 4. re-ordering the picks sticks
    const re = await request(app).put(`/api/v1/admin/homepage/sections/${id}/items/reorder`).set(auth).send([{ contentId: a, displayOrder: 0 }, { contentId: b, displayOrder: 1 }]);
    expect(re.status).toBe(200);
    list = await request(app).get("/api/v1/admin/homepage/sections").set(auth);
    expect(list.body.data.find((s: { id: string }) => s.id === id).items.map((i: { title: string }) => i.title)).toEqual(["Alpha", "Beta"]);

    // 5. removing one pick sticks
    expect((await request(app).delete(`/api/v1/admin/homepage/sections/${id}/items/${a}`).set(auth)).status).toBe(200);
    list = await request(app).get("/api/v1/admin/homepage/sections").set(auth);
    expect(list.body.data.find((s: { id: string }) => s.id === id).items.map((i: { title: string }) => i.title)).toEqual(["Beta"]);
  });

  it("switching back to Automatic needs the catalog it reads from, and says so clearly", async () => {
    const { accessToken } = await createAdmin(app, db);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const created = await request(app).post("/api/v1/admin/homepage/sections").set(auth).send({ key: "picks", displayTitle: "Picks", type: "MANUAL" });
    const id = created.body.data.id as string;

    const without = await request(app).put(`/api/v1/admin/homepage/sections/${id}`).set(auth).send({ type: "TRENDING" });
    expect(without.status).toBe(400);
    const withCatalog = await request(app).put(`/api/v1/admin/homepage/sections/${id}`).set(auth).send({ type: "TRENDING", contentType: "MOVIE" });
    expect(withCatalog.status).toBe(200);
    expect(withCatalog.body.data).toMatchObject({ type: "TRENDING", contentType: "MOVIE" });
  });

  it("the hero is manual when it has picked titles, and goes back to automatic when they are removed", async () => {
    const { accessToken } = await createAdmin(app, db);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const m = await makeContent("Hero Movie");
    const hero = await request(app).post("/api/v1/admin/homepage/sections").set(auth).send({ key: "hero", displayTitle: "Hero", type: "HERO", itemLimit: 3 });
    const id = hero.body.data.id as string;
    await request(app).post(`/api/v1/admin/homepage/sections/${id}/items`).set(auth).send({ contentId: m, displayOrder: 0 });
    let list = await request(app).get("/api/v1/admin/homepage/sections").set(auth);
    const picked = list.body.data.find((s: { id: string }) => s.id === id);
    expect(picked.type).toBe("HERO"); // the hero keeps its type: it is "manual" because it has picks
    expect(picked.items).toHaveLength(1);
    await request(app).delete(`/api/v1/admin/homepage/sections/${id}/items/${m}`).set(auth);
    list = await request(app).get("/api/v1/admin/homepage/sections").set(auth);
    expect(list.body.data.find((s: { id: string }) => s.id === id).items).toEqual([]);
  });
});
