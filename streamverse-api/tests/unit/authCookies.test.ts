import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from "../../src/utils/authCookies";

const app = express();
app.get("/set", (_req, res) => {
  setRefreshCookie(res, "a-raw-refresh-token-value", new Date(Date.now() + 60_000));
  res.json({ ok: true });
});
app.get("/clear", (_req, res) => {
  clearRefreshCookie(res);
  res.json({ ok: true });
});

describe("refresh cookie", () => {
  it("is httpOnly, scoped to the auth path, and not readable as a plain value in JS-land", async () => {
    const res = await request(app).get("/set");
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0]!;
    expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=a-raw-refresh-token-value`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    // not asserting Secure here: NODE_ENV is "test", and Secure is deliberately only set in production
  });

  it("clear sends an expiring cookie with the same name and path", async () => {
    const res = await request(app).get("/clear");
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0]!;
    expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=;`);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });
});
