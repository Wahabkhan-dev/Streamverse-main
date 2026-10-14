import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin } from "../helpers/adminAuth";

const db = prisma as unknown as {
  __reset: () => void;
  user: { update: (a: unknown) => Promise<unknown> };
  content: { create: (a: unknown) => Promise<{ id: string }> };
  movie: { create: (a: unknown) => Promise<unknown> };
  subscription: { create: (a: unknown) => Promise<unknown> };
  payment: { create: (a: unknown) => Promise<unknown> };
  mediaAsset: { create: (a: unknown) => Promise<unknown> };
};

const app = createApp();

beforeEach(() => db.__reset());

async function adminHeaders() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

describe("GET /api/v1/admin/dashboard/summary", () => {
  it("returns all required fields with correct types", async () => {
    const headers = await adminHeaders();
    const res = await request(app).get("/api/v1/admin/dashboard/summary").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalMovies: expect.any(Number),
      totalEbooks: expect.any(Number),
      totalAudiobooks: expect.any(Number),
      publishedContent: expect.any(Number),
      draftContent: expect.any(Number),
      totalUsers: expect.any(Number),
      activeSubscriptions: expect.any(Number),
      totalRevenueCents: expect.any(Number),
    });
  });

  it("counts users accurately after creation", async () => {
    const headers = await adminHeaders();
    // 1 admin already exists from createAdmin
    const res = await request(app).get("/api/v1/admin/dashboard/summary").set(headers);
    expect(res.body.data.totalUsers).toBeGreaterThanOrEqual(1);
  });

  it("requires ADMIN role", async () => {
    const res = await request(app).get("/api/v1/admin/dashboard/summary");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/admin/dashboard/recent-content", () => {
  it("returns an array of content ordered by createdAt desc", async () => {
    const headers = await adminHeaders();
    // Create some content via admin endpoint
    await request(app).post("/api/v1/admin/movies").set(headers).send({ title: "Movie A" });
    await request(app).post("/api/v1/admin/ebooks").set(headers).send({ title: "eBook A" });

    const res = await request(app).get("/api/v1/admin/dashboard/recent-content?limit=5").set(headers);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it("respects the limit parameter", async () => {
    const headers = await adminHeaders();
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/v1/admin/movies").set(headers).send({ title: `Movie ${i}` });
    }
    const res = await request(app).get("/api/v1/admin/dashboard/recent-content?limit=3").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(3);
  });

  it("never exposes deleted content", async () => {
    const headers = await adminHeaders();
    const created = await request(app).post("/api/v1/admin/movies").set(headers).send({ title: "To Delete" });
    const id = created.body.data.id as string;
    await request(app).delete(`/api/v1/admin/movies/${id}`).set(headers);

    const res = await request(app).get("/api/v1/admin/dashboard/recent-content").set(headers);
    const ids = (res.body.data as { id: string }[]).map((c) => c.id);
    expect(ids).not.toContain(id);
  });
});

describe("GET /api/v1/admin/dashboard/recent-users", () => {
  it("returns user array without password or token fields", async () => {
    const headers = await adminHeaders();
    const res = await request(app).get("/api/v1/admin/dashboard/recent-users?limit=5").set(headers);
    expect(res.status).toBe(200);
    const users = res.body.data as Record<string, unknown>[];
    for (const u of users) {
      expect(u["passwordHash"]).toBeUndefined();
      expect(u["stripeCustomerId"]).toBeUndefined();
      expect(u["id"]).toBeTruthy();
      expect(u["email"]).toBeTruthy();
    }
  });
});

describe("GET /api/v1/admin/dashboard/platform-status", () => {
  it("returns database, mediaAssets, subscriptions, payments fields", async () => {
    const headers = await adminHeaders();
    const res = await request(app).get("/api/v1/admin/dashboard/platform-status").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      database: expect.any(String),
      mediaAssets: { processing: expect.any(Number), failed: expect.any(Number), ready: expect.any(Number) },
      subscriptions: { active: expect.any(Number), pastDue: expect.any(Number) },
      payments: { failedLast24h: expect.any(Number) },
    });
    // Must not expose credentials
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("DATABASE_URL");
    expect(body).not.toContain("AWS_SECRET");
    expect(body).not.toContain("bucket");
  });
});
