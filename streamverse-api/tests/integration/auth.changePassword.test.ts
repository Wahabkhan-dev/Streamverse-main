import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { getCookie } from "../helpers/cookies";

const app = createApp();
let n = 0;
const freshCredentials = () => ({ email: `alex-${++n}@example.com`, password: "a-strong-passphrase", fullName: "Alex Morgan" });

beforeEach(() => (prisma as unknown as { __reset: () => void }).__reset());

async function register(creds: ReturnType<typeof freshCredentials>) {
  const res = await request(app).post("/api/v1/auth/register").send(creds);
  return { accessToken: res.body.data.accessToken as string, refreshToken: getCookie(res, "sv_refresh_token")! };
}

describe("POST /api/v1/auth/change-password", () => {
  it("rejects the wrong current password and leaves the password unchanged", async () => {
    const creds = freshCredentials();
    const { accessToken } = await register(creds);
    const res = await request(app).post("/api/v1/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({ currentPassword: "not-it", newPassword: "a-brand-new-passphrase" });
    expect(res.status).toBe(401);
    expect((await request(app).post("/api/v1/auth/login").send({ email: creds.email, password: creds.password })).status).toBe(200);
  });

  it("changes the password: the old one stops working, the new one works", async () => {
    const creds = freshCredentials();
    const { accessToken } = await register(creds);
    const res = await request(app).post("/api/v1/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({ currentPassword: creds.password, newPassword: "a-brand-new-passphrase" });
    expect(res.status).toBe(200);

    expect((await request(app).post("/api/v1/auth/login").send({ email: creds.email, password: creds.password })).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/login").send({ email: creds.email, password: "a-brand-new-passphrase" })).status).toBe(200);
  });

  it("documented behavior: revokes every session, including the one that made this request", async () => {
    const creds = freshCredentials();
    const { accessToken, refreshToken } = await register(creds);
    await request(app).post("/api/v1/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({ currentPassword: creds.password, newPassword: "a-brand-new-passphrase" });

    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`)).status).toBe(401);
    // the very access token used to make the change request is itself revoked-session-backed going forward:
    // refresh no longer works, so once it expires there is no way to get a new one without logging in again
    expect((await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`)).status).toBe(200); // still valid until its own (short) expiry — see README
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/v1/auth/change-password").send({ currentPassword: "x", newPassword: "a-brand-new-passphrase" });
    expect(res.status).toBe(401);
  });

  it("validates the new password's length", async () => {
    const creds = freshCredentials();
    const { accessToken } = await register(creds);
    const res = await request(app).post("/api/v1/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send({ currentPassword: creds.password, newPassword: "short" });
    expect(res.status).toBe(400);
  });
});
