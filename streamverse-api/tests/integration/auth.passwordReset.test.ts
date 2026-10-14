import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendPasswordReset = vi.fn();
vi.mock("../../src/services/email.service", () => ({
  sendPasswordReset: (...args: unknown[]) => sendPasswordReset(...args),
  sendWelcomeEmail: vi.fn(),
  sendBillingNotification: vi.fn(),
}));

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { sha256Hex } from "../../src/utils/tokens";
import { getCookie } from "../helpers/cookies";

const db = prisma as unknown as { __reset: () => void; passwordResetToken: { findUnique: (a: unknown) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> } };
const app = createApp();

beforeEach(() => {
  db.__reset();
  sendPasswordReset.mockClear();
});

// Each test uses its own email: the password-reset rate limiter is keyed by ip+email, and this app/limiter
// instance (like the real one) is shared across every test in this file, not reset between them.
let n = 0;
const freshCredentials = () => ({ email: `alex-${++n}@example.com`, password: "a-strong-passphrase", fullName: "Alex Morgan" });

async function register(creds: ReturnType<typeof freshCredentials>) {
  const res = await request(app).post("/api/v1/auth/register").send(creds);
  return getCookie(res, "sv_refresh_token")!;
}

async function requestReset(email: string) {
  await request(app).post("/api/v1/auth/forgot-password").send({ email });
  return (sendPasswordReset.mock.calls.at(-1)![0] as { resetToken: string }).resetToken;
}

describe("POST /api/v1/auth/forgot-password", () => {
  it("for a known email: sends a reset email and returns the generic message", async () => {
    const creds = freshCredentials();
    await register(creds);
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: creds.email });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("If an account exists for that email, password reset instructions have been sent.");
    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    expect((sendPasswordReset.mock.calls[0]![0] as { to: string }).to).toBe(creds.email);
  });

  it("for an unknown email: the exact same response, and no email sent", async () => {
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("If an account exists for that email, password reset instructions have been sent.");
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it("never echoes the token/link anywhere in the response", async () => {
    const creds = freshCredentials();
    await register(creds);
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: creds.email });
    const token = (sendPasswordReset.mock.calls[0]![0] as { resetToken: string }).resetToken;
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
});

describe("POST /api/v1/auth/reset-password", () => {
  it("resets the password with a valid token, and the new password works while the old one doesn't", async () => {
    const creds = freshCredentials();
    await register(creds);
    const token = await requestReset(creds.email);
    const res = await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: "a-brand-new-passphrase" });
    expect(res.status).toBe(200);

    expect((await request(app).post("/api/v1/auth/login").send({ email: creds.email, password: creds.password })).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/login").send({ email: creds.email, password: "a-brand-new-passphrase" })).status).toBe(200);
  });

  it("revokes existing sessions, and does not log the caller in automatically", async () => {
    const creds = freshCredentials();
    const refreshToken = await register(creds);
    const token = await requestReset(creds.email);

    const res = await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: "a-brand-new-passphrase" });
    expect(getCookie(res, "sv_refresh_token")).toBeUndefined();
    expect(res.body.data).toBeNull();
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`)).status).toBe(401);
  });

  it("rejects an unknown/garbage token", async () => {
    const res = await request(app).post("/api/v1/auth/reset-password").send({ token: "x".repeat(32), newPassword: "a-brand-new-passphrase" });
    expect(res.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const creds = freshCredentials();
    await register(creds);
    const token = await requestReset(creds.email);
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
    await db.passwordResetToken.update({ where: { id: record!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: "a-brand-new-passphrase" });
    expect(res.status).toBe(400);
  });

  it("rejects a token that was already used once", async () => {
    const creds = freshCredentials();
    await register(creds);
    const token = await requestReset(creds.email);
    expect((await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: "a-brand-new-passphrase" })).status).toBe(200);
    const res = await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: "yet-another-passphrase" });
    expect(res.status).toBe(400);
  });
});
