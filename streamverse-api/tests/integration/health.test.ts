/**
 * Phase 10: dedicated health and readiness endpoint tests.
 * /health is a lightweight liveness check (no DB). /ready checks DB connectivity.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/health.repository", () => ({
  pingDatabase: vi.fn(),
}));

import { createApp } from "../../src/app";
import { pingDatabase } from "../../src/repositories/health.repository";

const app = createApp();

beforeEach(() => {
  vi.mocked(pingDatabase).mockReset();
});

describe("/health (Phase 10)", () => {
  it("returns 200 with { status: 'ok' } and does not touch the DB", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: "ok" } });
    expect(res.body.data.timestamp).toBeDefined();
    expect(pingDatabase).not.toHaveBeenCalled();
  });

  it("includes a timestamp in ISO-8601 format", async () => {
    const res = await request(app).get("/health");
    expect(() => new Date(res.body.data.timestamp as string)).not.toThrow();
  });
});

describe("/ready (Phase 10)", () => {
  it("returns 200 when the database is reachable", async () => {
    vi.mocked(pingDatabase).mockResolvedValue(undefined);
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ready: true });
  });

  it("returns 503 when the database is unreachable", async () => {
    vi.mocked(pingDatabase).mockRejectedValue(new Error("connection refused"));
    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, code: "SERVICE_UNAVAILABLE" });
  });

  it("never leaks DB error details in the 503 response", async () => {
    vi.mocked(pingDatabase).mockRejectedValue(new Error("password=hunter2 host=10.0.0.1"));
    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|10\.0\.0\.1/);
  });
});
