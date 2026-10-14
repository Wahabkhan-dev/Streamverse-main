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

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

describe("Access security (Section 77/82)", () => {
  it("every /me route 401s without a token", async () => {
    for (const path of ["/api/v1/me/profile", "/api/v1/me/my-list", "/api/v1/me/library", "/api/v1/me/continue", "/api/v1/me/history", "/api/v1/me/notifications"]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it("rejects a client-supplied userId — the account always comes from the token", async () => {
    const { accessToken } = await createUser(app);
    const { content } = await makePublishedMovie();
    // even if a malicious client sneaks a userId into the body, the server must ignore it and use req.auth
    const res = await request(app)
      .put(`/api/v1/me/progress/movie/${content.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ positionSeconds: 5, durationSeconds: 100, userId: "someone-elses-id" });
    expect(res.status).toBe(200);

    const mine = await request(app).get(`/api/v1/me/progress/movie/${content.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(mine.body.data.positionSeconds).toBe(5);
  });

  it("an immediately-suspended account loses access even with a still-valid access token", async () => {
    const { accessToken, email } = await createUser(app);
    const typedDb = prisma as unknown as { user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string }>; update: (a: unknown) => Promise<unknown> } };
    const user = await typedDb.user.findUnique({ where: { email } });
    await typedDb.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });

    const res = await request(app).get("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });

  it("a deleted/missing user's token is rejected", async () => {
    const { accessToken, email } = await createUser(app);
    const typedDb = prisma as unknown as { user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string }>; delete: (a: unknown) => Promise<unknown> } };
    const user = await typedDb.user.findUnique({ where: { email } });
    await typedDb.user.delete({ where: { id: user.id } });

    const res = await request(app).get("/api/v1/me/profile").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });

  it("rejects a malformed or missing bearer token the same way as no token", async () => {
    const malformed = await request(app).get("/api/v1/me/profile").set("Authorization", "NotBearer abc123");
    expect(malformed.status).toBe(401);
    const garbage = await request(app).get("/api/v1/me/profile").set("Authorization", "Bearer not-a-real-jwt");
    expect(garbage.status).toBe(401);
  });

  it("public discovery routes work with no token at all", async () => {
    await makePublishedMovie({ title: "Public Movie" });
    expect((await request(app).get("/api/v1/movies")).status).toBe(200);
    expect((await request(app).get("/api/v1/homepage")).status).toBe(200);
    expect((await request(app).get("/api/v1/search").query({ q: "Public" })).status).toBe(200);
  });
});
