import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { prisma } from "../../src/config/database";
import { errorHandler } from "../../src/middleware/error.middleware";
import { requireAuth } from "../../src/middleware/auth.middleware";
import { requestId } from "../../src/middleware/requestId.middleware";
import { requireRole } from "../../src/middleware/role.middleware";
import { asyncHandler } from "../../src/utils/asyncHandler";
import { sendSuccess } from "../../src/utils/apiResponse";

const db = prisma as unknown as { __reset: () => void; user: { update: (a: unknown) => Promise<unknown>; findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null> } };
const app = createApp(); // the real app: used to create users, and to check the real /api/v1/admin router

// A minimal app exercising requireAuth / requireRole directly — no permanent admin feature is added just
// to test role enforcement (Section 36); this mirrors how every real protected route is built.
const probeApp = express();
probeApp.use(requestId);
probeApp.use(express.json());
probeApp.get("/user-or-admin", requireAuth, asyncHandler(async (req, res) => sendSuccess(res, { userId: req.auth!.userId, role: req.auth!.role }, "ok")));
probeApp.get("/admin-only", requireAuth, requireRole("ADMIN"), asyncHandler(async (req, res) => sendSuccess(res, { role: req.auth!.role }, "ok")));
probeApp.use(errorHandler);

beforeEach(() => db.__reset());

async function registerAndGetToken(role?: "ADMIN") {
  const email = `${(role ?? "user").toLowerCase()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post("/api/v1/auth/register").send({ email, password: "a-strong-passphrase", fullName: "Test" });
  const accessToken: string = res.body.data.accessToken;
  if (role === "ADMIN") {
    const user = await db.user.findUnique({ where: { email } });
    await db.user.update({ where: { id: user!.id }, data: { role: "ADMIN" } });
  }
  return { accessToken, email };
}

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", async () => {
    expect((await request(probeApp).get("/user-or-admin")).status).toBe(401);
  });

  it("accepts a valid access token", async () => {
    const { accessToken } = await registerAndGetToken();
    const res = await request(probeApp).get("/user-or-admin").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it("rejects an expired access token", async () => {
    const { email } = await registerAndGetToken();
    const user = await db.user.findUnique({ where: { email } });
    const expired = jwt.sign({ sub: user!.id, role: "USER" }, env.JWT_SECRET, { issuer: "streamverse-api", audience: "streamverse-frontend", expiresIn: -1 });
    expect((await request(probeApp).get("/user-or-admin").set("Authorization", `Bearer ${expired}`)).status).toBe(401);
  });

  it("rejects a malformed / invalid-signature token", async () => {
    expect((await request(probeApp).get("/user-or-admin").set("Authorization", "Bearer not-a-real-token")).status).toBe(401);
  });

  it("rejects a token for an account that no longer exists", async () => {
    const forged = jwt.sign({ sub: "nonexistent-id", role: "USER" }, env.JWT_SECRET, { issuer: "streamverse-api", audience: "streamverse-frontend", expiresIn: "15m" });
    expect((await request(probeApp).get("/user-or-admin").set("Authorization", `Bearer ${forged}`)).status).toBe(401);
  });

  it("rejects a SUSPENDED account even with a perfectly valid, unexpired access token (immediate enforcement)", async () => {
    const { accessToken, email } = await registerAndGetToken();
    expect((await request(probeApp).get("/user-or-admin").set("Authorization", `Bearer ${accessToken}`)).status).toBe(200);
    const user = await db.user.findUnique({ where: { email } });
    await db.user.update({ where: { id: user!.id }, data: { status: "SUSPENDED" } });
    expect((await request(probeApp).get("/user-or-admin").set("Authorization", `Bearer ${accessToken}`)).status).toBe(401);
  });
});

describe('requireRole("ADMIN")', () => {
  it("401s an unauthenticated request before it ever checks role", async () => {
    expect((await request(probeApp).get("/admin-only")).status).toBe(401);
  });

  it("403s a USER", async () => {
    const { accessToken } = await registerAndGetToken();
    const res = await request(probeApp).get("/admin-only").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You do not have permission to perform this action");
  });

  it("200s an ADMIN", async () => {
    const { accessToken } = await registerAndGetToken("ADMIN");
    const res = await request(probeApp).get("/admin-only").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("ADMIN");
  });

  it("protects the real /api/v1/admin router the same way (401 / 403 / past-the-gate)", async () => {
    const { accessToken: userToken } = await registerAndGetToken();
    const { accessToken: adminToken } = await registerAndGetToken("ADMIN");
    expect((await request(app).get("/api/v1/admin")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin").set("Authorization", `Bearer ${userToken}`)).status).toBe(403);
    // ADMIN clears the role gate; 404 here just means no feature route is registered under /admin yet (Phase 2 adds none)
    expect((await request(app).get("/api/v1/admin").set("Authorization", `Bearer ${adminToken}`)).status).toBe(404);
  });
});
