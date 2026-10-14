/**
 * Phase 8 — Availability window tests.
 * Content can have availableFrom and/or availableUntil dates that gate access.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createUser } from "../helpers/adminAuth";
import { makePublishedMovie } from "../helpers/publishedContent";

const db = prisma as unknown as {
  __reset: () => void;
  content: { update: (a: unknown) => Promise<unknown> };
};
const app = createApp();
beforeEach(() => db.__reset());

async function authHeaders() {
  const { accessToken } = await createUser(app);
  return { Authorization: `Bearer ${accessToken}` };
}

function future(offsetDays = 1): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function past(offsetDays = 1): Date {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d;
}

describe("availableFrom in the future → NOT_YET_AVAILABLE", () => {
  it("denies access when availableFrom has not passed yet", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { availableFrom: future(7) } });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "NOT_YET_AVAILABLE" });
    // metadata is still visible
    expect(res.body.data.access.canViewMetadata).toBe(true);
  });
});

describe("availableUntil in the past → AVAILABILITY_EXPIRED", () => {
  it("denies access when availableUntil has already passed", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { availableUntil: past(7) } });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "AVAILABILITY_EXPIRED" });
    expect(res.body.data.access.canViewMetadata).toBe(true);
  });
});

describe("Content inside its availability window is accessible", () => {
  it("allows when availableFrom is in the past and availableUntil is in the future", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { availableFrom: past(3), availableUntil: future(30) } });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });

  it("allows when both availableFrom and availableUntil are null (no window restriction)", async () => {
    const { content } = await makePublishedMovie();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });
});

describe("SCHEDULED status", () => {
  it("denies access for a SCHEDULED movie where publishAt is still in the future (not yet published → 404)", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { status: "SCHEDULED", publishAt: future(3) } });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    // Step 3 blocks at "not published" — content is not yet live, so its existence is not confirmed (404)
    expect(res.status).toBe(404);
  });

  it("allows access for a SCHEDULED movie where publishAt has passed (treat as published)", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { status: "SCHEDULED", publishAt: past(1) } });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });
});
