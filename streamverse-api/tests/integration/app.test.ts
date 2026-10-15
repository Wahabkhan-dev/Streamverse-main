import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/app";
import { errorHandler } from "../../src/middleware/error.middleware";
import { createRateLimiter } from "../../src/middleware/rateLimit.middleware";
import { requestId } from "../../src/middleware/requestId.middleware";
import { validate } from "../../src/middleware/validate.middleware";
import { pingDatabase } from "../../src/repositories/health.repository";
import { sendSuccess } from "../../src/utils/apiResponse";
import { asyncHandler } from "../../src/utils/asyncHandler";

vi.mock("../../src/repositories/health.repository", () => ({ pingDatabase: vi.fn() }));

const app = createApp();

describe("health", () => {
  it("GET /health is a quick liveness check that does not touch the database", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: "ok" } });
    expect(pingDatabase).not.toHaveBeenCalled();
  });

  it("GET /ready is 200 when the database answers", async () => {
    vi.mocked(pingDatabase).mockResolvedValue(undefined);
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ready: true, checks: { database: "ok" } });
  });

  it("GET /ready is 503 and leaks nothing when the database is down", async () => {
    vi.mocked(pingDatabase).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"));
    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, message: "Service is not ready", code: "SERVICE_UNAVAILABLE" });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|hunter2|10\.0\.0\.5/);
  });

  it("is also available under /api/v1", async () => {
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
  });
});

describe("unknown routes", () => {
  it("return JSON 404, never HTML", async () => {
    for (const path of ["/nope", "/api/v1/nope", "/api/v1/this-route-does-not-exist"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toMatchObject({ success: false, errors: [] });
    }
  });
});

describe("request ids", () => {
  it("generates one per request and returns it in the header and in errors", async () => {
    const res = await request(app).get("/missing");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("reuses a safe caller id and replaces an unsafe one", async () => {
    expect((await request(app).get("/health").set("X-Request-Id", "trace-abc12345")).headers["x-request-id"]).toBe("trace-abc12345");
    const bad = await request(app).get("/health").set("X-Request-Id", "short id!");
    expect(bad.headers["x-request-id"]).not.toBe("short id!");
    expect(bad.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("security headers and CORS", () => {
  it("sets helmet headers and hides the framework", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
  });

  it("allows configured frontend origins with credentials", async () => {
    for (const origin of ["http://localhost:5173", "http://localhost:5180"]) {
      const res = await request(app).get("/health").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    }
  });

  it("sends no CORS headers to other origins, and never a wildcard", async () => {
    const res = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    const pre = await request(app).options("/api/v1/anything").set("Origin", "http://localhost:5173").set("Access-Control-Request-Method", "POST");
    expect(pre.status).toBe(204);
    expect(pre.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});

describe("body handling and errors", () => {
  it("rejects malformed JSON with a clean 400", async () => {
    const res = await request(app).post("/api/v1/x").set("Content-Type", "application/json").send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: "Request body is not valid JSON" });
  });

  it("rejects oversized bodies with 413", async () => {
    // Body limit is 1 MB — send 1.2 MB to exceed it
    const res = await request(app).post("/api/v1/x").send({ big: "x".repeat(1_200_000) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("validation, async errors and the response envelope", () => {
  const mini = express();
  mini.use(requestId);
  mini.use(express.json());
  const body = z.object({ email: z.email(), name: z.string().min(2) });
  mini.post("/users/:id", validate({ params: z.object({ id: z.coerce.number().int() }), body }), (req, res) => {
    sendSuccess(res, { id: req.params["id"], body: req.body }, "Created", 201);
  });
  mini.get(
    "/boom",
    asyncHandler(async () => {
      throw new Error("db password is hunter2");
    }),
  );
  mini.use(errorHandler);

  it("returns field-level errors in the standard shape", async () => {
    const res = await request(mini).post("/users/abc").send({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: "Validation failed" });
    const paths = res.body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["params.id", "body.email", "body.name"]));
  });

  it("strips fields the schema does not list (mass assignment)", async () => {
    const res = await request(mini).post("/users/7").send({ email: "a@b.co", name: "Al", role: "ADMIN", isAdmin: true });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, message: "Created", data: { id: 7, body: { email: "a@b.co", name: "Al" } } });
  });

  it("turns unexpected failures into a generic 500 with no internals", async () => {
    const res = await request(mini).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false, message: "Something went wrong" });
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|stack/);
  });
});

describe("rate limiting", () => {
  it("answers 429 in the standard error shape once the limit is hit", async () => {
    const limited = createApp({ limiter: createRateLimiter({ name: "test", windowMs: 60_000, limit: 2 }) });
    expect((await request(limited).get("/api/v1/a")).status).toBe(404);
    expect((await request(limited).get("/api/v1/a")).status).toBe(404);
    const res = await request(limited).get("/api/v1/a");
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false, code: "RATE_LIMITED" });
  });

  it("does not limit health checks", async () => {
    const limited = createApp({ limiter: createRateLimiter({ name: "test", windowMs: 60_000, limit: 1 }) });
    for (let i = 0; i < 5; i++) expect((await request(limited).get("/health")).status).toBe(200);
  });
});

describe("API docs", () => {
  it("serves the OpenAPI document and Swagger UI outside production", async () => {
    const doc = await request(app).get("/api/v1/docs.json");
    expect(doc.status).toBe(200);
    expect(doc.body.openapi).toBe("3.0.3");
    expect(Object.keys(doc.body.paths)).toEqual(expect.arrayContaining(["/health", "/ready"]));
    const ui = await request(app).get("/api/v1/docs/");
    expect(ui.status).toBe(200);
    expect(ui.headers["content-type"]).toMatch(/html/);
  });
});
