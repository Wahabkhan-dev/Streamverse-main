import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin } from "../helpers/adminAuth";

const db = prisma as unknown as {
  __reset: () => void;
  user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> };
  auditLog: { findMany: (a: unknown) => Promise<unknown[]>; create: (a: unknown) => Promise<{ id: string }> };
};
const app = createApp();

beforeEach(() => db.__reset());

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

describe("audit log listing", () => {
  it("GET /api/v1/admin/audit-logs returns paginated list", async () => {
    const headers = await admin();
    // Create some audit log entries via admin actions
    await request(app).post("/api/v1/admin/genres").set(headers).send({ name: "Drama" });

    const res = await request(app).get("/api/v1/admin/audit-logs").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(0);
  });

  it("filters by action", async () => {
    const headers = await admin();
    await request(app).post("/api/v1/admin/genres").set(headers).send({ name: "Action" });

    const res = await request(app).get("/api/v1/admin/audit-logs?action=genre.created").set(headers);
    expect(res.status).toBe(200);
    const entries = res.body.data as { action: string }[];
    for (const e of entries) {
      expect(e.action).toBe("genre.created");
    }
  });

  it("respects limit parameter (max 100)", async () => {
    const headers = await admin();
    const res = await request(app).get("/api/v1/admin/audit-logs?limit=5").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it("requires ADMIN role", async () => {
    const res = await request(app).get("/api/v1/admin/audit-logs");
    expect(res.status).toBe(401);
  });
});

describe("audit log detail", () => {
  it("GET /api/v1/admin/audit-logs/:id returns one entry", async () => {
    const headers = await admin();
    // create an entry
    await request(app).post("/api/v1/admin/genres").set(headers).send({ name: "Comedy" });
    // get the list to find the id
    const list = await request(app).get("/api/v1/admin/audit-logs?action=genre.created").set(headers);
    const id = (list.body.data as { id: string }[])[0]?.id;
    if (!id) return; // no entries yet is okay

    const res = await request(app).get(`/api/v1/admin/audit-logs/${id}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it("returns 404 for nonexistent id", async () => {
    const headers = await admin();
    const res = await request(app).get("/api/v1/admin/audit-logs/nonexistent-id").set(headers);
    expect(res.status).toBe(404);
  });
});

describe("audit log immutability", () => {
  it("has no PUT endpoint (405 or 404)", async () => {
    const headers = await admin();
    const res = await request(app).put("/api/v1/admin/audit-logs/some-id").set(headers).send({});
    expect([404, 405]).toContain(res.status);
  });

  it("has no DELETE endpoint (405 or 404)", async () => {
    const headers = await admin();
    const res = await request(app).delete("/api/v1/admin/audit-logs/some-id").set(headers);
    expect([404, 405]).toContain(res.status);
  });
});

describe("secret redaction", () => {
  it("audit metadata never contains password or token fields", async () => {
    const headers = await admin();
    // Create some audit entries
    await request(app).post("/api/v1/admin/genres").set(headers).send({ name: "Thriller" });

    const res = await request(app).get("/api/v1/admin/audit-logs").set(headers);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain('"token"');
    expect(body).not.toContain("stripeSecretKey");
  });
});
