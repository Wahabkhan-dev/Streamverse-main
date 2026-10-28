import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["HOMEPAGE_CACHE_TTL_SECONDS"] = "30";
});

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import * as homepageService from "../../src/services/homepage.service";
import { analyticsCache } from "../../src/utils/analyticsCache";
import { createAdmin } from "../helpers/adminAuth";

const db = prisma as unknown as { __reset: () => void; user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> } };
const app = createApp();

beforeEach(() => {
  db.__reset();
  analyticsCache.invalidate();
});

const keys = async () => (await request(app).get("/api/v1/homepage")).body.data.map((s: { key: string }) => s.key);

describe("public homepage cache", () => {
  it("serves repeat reads from cache, and an admin write invalidates it", async () => {
    await homepageService.createSection({ key: "first", displayTitle: "First", enabled: true, displayOrder: 0, itemLimit: 6, type: "MANUAL" });
    expect(await keys()).toEqual(["first"]);

    // written behind the cache's back (service call, not an admin HTTP request) -> still the cached payload
    await homepageService.createSection({ key: "second", displayTitle: "Second", enabled: true, displayOrder: 1, itemLimit: 6, type: "MANUAL" });
    expect(await keys()).toEqual(["first"]);

    // a successful admin write drops the cache, so the next read sees both
    const { accessToken } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/homepage/sections").set("Authorization", `Bearer ${accessToken}`).send({ key: "third", displayTitle: "Third", type: "MANUAL", displayOrder: 2 });
    expect(created.status).toBe(201);
    expect(await keys()).toEqual(["first", "second", "third"]);
  });

  it("does not invalidate on a failed admin write", async () => {
    await homepageService.createSection({ key: "first", displayTitle: "First", enabled: true, displayOrder: 0, itemLimit: 6, type: "MANUAL" });
    expect(await keys()).toEqual(["first"]);
    await homepageService.createSection({ key: "second", displayTitle: "Second", enabled: true, displayOrder: 1, itemLimit: 6, type: "MANUAL" });

    const { accessToken } = await createAdmin(app, db);
    const bad = await request(app).post("/api/v1/admin/homepage/sections").set("Authorization", `Bearer ${accessToken}`).send({ key: "Bad Key!", displayTitle: "x", type: "MANUAL" });
    expect(bad.status).toBe(400);
    expect(await keys()).toEqual(["first"]);
  });
});
