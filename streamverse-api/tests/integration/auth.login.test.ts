import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { RATE_POLICIES } from "../../src/middleware/rateLimit.middleware";
import { getCookie } from "../helpers/cookies";

const db = prisma as unknown as { __reset: () => void; user: { update: (a: unknown) => Promise<unknown>; findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null> } };
const app = createApp();
const credentials = { email: "alex@example.com", password: "a-strong-passphrase" };

beforeEach(() => {
  (prisma as unknown as { __reset: () => void }).__reset();
});

async function registerUser() {
  await request(app).post("/api/v1/auth/register").send({ ...credentials, fullName: "Alex Morgan" });
}

describe("POST /api/v1/auth/login", () => {
  it("logs in with the right credentials, sets lastLoginAt and never returns the password hash", async () => {
    await registerUser();
    const res = await request(app).post("/api/v1/auth/login").send(credentials);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("alex@example.com");
    expect(res.body.data.user.lastLoginAt).toBeTruthy();
    expect(res.body.data.user).not.toHaveProperty("passwordHash");
    expect(getCookie(res, "sv_refresh_token")).toBeTruthy();
  });

  it("rejects the wrong password with a generic message", async () => {
    await registerUser();
    const res = await request(app).post("/api/v1/auth/login").send({ ...credentials, password: "totally-wrong" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password.");
  });

  it("rejects an unknown email with the exact same generic message", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "nobody@example.com", password: "whatever123" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password.");
  });

  it("blocks a SUSPENDED account, with the same generic message, not a different one", async () => {
    await registerUser();
    const user = await db.user.findUnique({ where: { email: "alex@example.com" } });
    await db.user.update({ where: { id: user!.id }, data: { status: "SUSPENDED" } });
    const res = await request(app).post("/api/v1/auth/login").send(credentials);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password.");
  });

  it("blocks a DELETED account", async () => {
    await registerUser();
    const user = await db.user.findUnique({ where: { email: "alex@example.com" } });
    await db.user.update({ where: { id: user!.id }, data: { status: "DELETED" } });
    const res = await request(app).post("/api/v1/auth/login").send(credentials);
    expect(res.status).toBe(401);
  });

  it("does not lock out a normal user who mistypes their password once", async () => {
    await registerUser();
    await request(app).post("/api/v1/auth/login").send({ ...credentials, password: "oops" });
    const res = await request(app).post("/api/v1/auth/login").send(credentials);
    expect(res.status).toBe(200);
  });

  it("is rate limited (429, standard error shape) once an email+IP exceeds the login policy's attempt limit", async () => {
    // its own email, so its bucket (keyed by ip+email) is unaffected by the attempts other tests made above
    const isolated = { email: "ratelimit-target@example.com", password: "a-strong-passphrase" };
    await request(app).post("/api/v1/auth/register").send({ ...isolated, fullName: "Rate Limited" });
    for (let i = 0; i < RATE_POLICIES.login.limit; i++) expect((await request(app).post("/api/v1/auth/login").send({ ...isolated, password: "wrong" })).status).toBe(401);
    const res = await request(app).post("/api/v1/auth/login").send(isolated); // right password, but the bucket is already spent
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, code: "RATE_LIMITED" });
  });
});
