import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { sha256Hex } from "../../src/utils/tokens";
import { getCookie } from "../helpers/cookies";

const db = prisma as unknown as {
  __reset: () => void;
  user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null> };
  authSession: { findUnique: (a: unknown) => Promise<{ id: string; revokedAt: Date | null; expiresAt: Date; userId: string } | null>; update: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown>; all: () => { userId: string; revokedAt: Date | null }[] };
};
const app = createApp();
const credentials = { email: "alex@example.com", password: "a-strong-passphrase", fullName: "Alex Morgan" };

beforeEach(() => db.__reset());

async function registerAndGetRefreshToken() {
  const res = await request(app).post("/api/v1/auth/register").send(credentials);
  return { res, refreshToken: getCookie(res, "sv_refresh_token")!, accessToken: res.body.data.accessToken as string };
}

describe("POST /api/v1/auth/refresh", () => {
  it("issues a new access token and a new (different) refresh token", async () => {
    const { refreshToken } = await registerAndGetRefreshToken();
    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe("string");
    const rotated = getCookie(res, "sv_refresh_token");
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(refreshToken);
  });

  it("rotation: the old refresh token cannot be used a second time", async () => {
    const { refreshToken } = await registerAndGetRefreshToken();
    const first = await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`);
    expect(first.status).toBe(200);
    const reuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`);
    expect(reuse.status).toBe(401);
  });

  it("reuse of an already-rotated token revokes every session for that account", async () => {
    const { refreshToken } = await registerAndGetRefreshToken();
    const rotated1 = await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`);
    const newToken = getCookie(rotated1, "sv_refresh_token")!;

    await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`); // reuse: triggers theft response

    // the legitimately-rotated token is now ALSO dead, because reuse revoked everything for the account
    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${newToken}`);
    expect(res.status).toBe(401);
  });

  it("rejects an expired refresh token", async () => {
    const { refreshToken } = await registerAndGetRefreshToken();
    const session = await db.authSession.findUnique({ where: { tokenHash: sha256Hex(refreshToken) } });
    await db.authSession.update({ where: { id: session!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`);
    expect(res.status).toBe(401);
  });

  it("rejects an already-revoked refresh token (e.g. from a prior logout)", async () => {
    const { refreshToken } = await registerAndGetRefreshToken();
    await request(app).post("/api/v1/auth/logout").set("Cookie", `sv_refresh_token=${refreshToken}`);
    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`);
    expect(res.status).toBe(401);
  });

  it("rejects when there is no refresh cookie at all", async () => {
    expect((await request(app).post("/api/v1/auth/refresh")).status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the session so refresh stops working, and clears the cookie", async () => {
    const { refreshToken } = await registerAndGetRefreshToken();
    const res = await request(app).post("/api/v1/auth/logout").set("Cookie", `sv_refresh_token=${refreshToken}`);
    expect(res.status).toBe(200);
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${refreshToken}`)).status).toBe(401);
  });

  it("succeeds even with no session (nothing to revoke)", async () => {
    expect((await request(app).post("/api/v1/auth/logout")).status).toBe(200);
  });
});

describe("POST /api/v1/auth/logout-all", () => {
  it("revokes every session for the account, not just the current one", async () => {
    const first = await registerAndGetRefreshToken();
    const second = await request(app).post("/api/v1/auth/login").send({ email: credentials.email, password: credentials.password });
    const secondRefresh = getCookie(second, "sv_refresh_token")!;

    const res = await request(app).post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${first.accessToken}`);
    expect(res.status).toBe(200);

    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${first.refreshToken}`)).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", `sv_refresh_token=${secondRefresh}`)).status).toBe(401);
  });

  it("requires authentication", async () => {
    expect((await request(app).post("/api/v1/auth/logout-all")).status).toBe(401);
  });
});
