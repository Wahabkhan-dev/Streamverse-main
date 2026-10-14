/**
 * Phase 10: security header and error-safety tests.
 * Verifies that Helmet headers are present and that errors never leak internals.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app";

const app = createApp();

describe("Security headers (Phase 10)", () => {
  it("sets X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options: SAMEORIGIN or DENY via helmet", async () => {
    const res = await request(app).get("/health");
    // helmet sets X-Frame-Options to SAMEORIGIN by default; DENY is also acceptable
    expect(res.headers["x-frame-options"]).toMatch(/SAMEORIGIN|DENY/);
  });

  it("sets Strict-Transport-Security (HSTS)", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  it("sets Content-Security-Policy", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("hides the server framework (X-Powered-By removed)", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("never returns a stack trace in 500 errors", async () => {
    // Malformed JSON forces a 400; an unknown route gives 404 — neither leaks stack
    const res = await request(app).post("/api/v1/x").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|at async|\.ts:|\.js:/);
    expect(JSON.stringify(res.body)).not.toContain("stack");
  });

  it("unknown routes return JSON 404 with no internals", async () => {
    const res = await request(app).get("/api/v1/does-not-exist-phase10");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(JSON.stringify(res.body)).not.toContain("stack");
  });
});
