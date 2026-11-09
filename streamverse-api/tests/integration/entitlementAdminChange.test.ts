/**
 * An admin change to a title applies to the very next Play: the short-lived per-user access decisions
 * (entitlementCache, 60 s) are dropped on every successful admin write, not left to expire.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { makePublishedMovie } from "../helpers/publishedContent";
import * as entitlementCache from "../../src/services/entitlement/entitlementCache.service";

const db = prisma as unknown as { __reset: () => void; user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> } };
const app = createApp();
beforeEach(() => {
  db.__reset();
  entitlementCache.clear();
});

describe("admin changes reach the next Play at once", () => {
  it("a title made age-restricted is refused right away to a viewer whose 'allowed' answer was cached", async () => {
    const { content } = await makePublishedMovie({ visibility: "PUBLIC" });
    const { accessToken } = await createUser(app);
    const viewer = { Authorization: `Bearer ${accessToken}` };
    const admin = await createAdmin(app, db);

    const before = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(viewer);
    expect(before.body.data.access.canConsume).toBe(true); // now cached for this viewer

    const edit = await request(app).put(`/api/v1/admin/movies/${content.id}`).set({ Authorization: `Bearer ${admin.accessToken}` }).send({ age: { ageRestricted: true, minimumAge: 18 } });
    expect(edit.status).toBe(200);

    const after = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(viewer);
    expect(after.body.data.access).toMatchObject({ canConsume: false, reason: "AGE_NOT_VERIFIED" });
  });

  it("a failed admin write keeps the cached decisions (nothing changed)", async () => {
    const { content } = await makePublishedMovie({ visibility: "PUBLIC" });
    const { accessToken } = await createUser(app);
    await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set({ Authorization: `Bearer ${accessToken}` });
    const cached = entitlementCache.size();
    expect(cached).toBeGreaterThan(0);
    const admin = await createAdmin(app, db);
    const bad = await request(app).put(`/api/v1/admin/movies/${content.id}`).set({ Authorization: `Bearer ${admin.accessToken}` }).send({ age: { ageRestricted: true } }); // minimumAge missing → 400
    expect(bad.status).toBe(400);
    expect(entitlementCache.size()).toBe(cached);
  });
});
