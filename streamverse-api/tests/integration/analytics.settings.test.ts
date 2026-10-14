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
  appSetting: { findMany: (a: unknown) => Promise<unknown[]> };
};
const app = createApp();

beforeEach(() => db.__reset());

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

describe("GET /api/v1/settings/public", () => {
  it("returns public settings without auth", async () => {
    const res = await request(app).get("/api/v1/settings/public");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    // Public settings include maintenanceMode and registrationEnabled
    expect(res.body.data).toHaveProperty("maintenanceMode");
    expect(res.body.data).toHaveProperty("registrationEnabled");
  });

  it("does NOT include non-public settings (billingNotifications)", async () => {
    const res = await request(app).get("/api/v1/settings/public");
    expect(res.status).toBe(200);
    // Private settings should not appear in public endpoint
    expect(res.body.data).not.toHaveProperty("billingNotifications");
  });
});

describe("GET /api/v1/admin/settings", () => {
  it("returns all settings (admin only)", async () => {
    const headers = await admin();
    const res = await request(app).get("/api/v1/admin/settings").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("maintenanceMode");
    expect(res.body.data).toHaveProperty("registrationEnabled");
    expect(res.body.data).toHaveProperty("billingNotifications");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/v1/admin/settings");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/v1/admin/settings", () => {
  it("updates a valid boolean setting", async () => {
    const headers = await admin();
    const res = await request(app)
      .patch("/api/v1/admin/settings")
      .set(headers)
      .send({ settings: [{ key: "maintenanceMode", value: true }] });
    expect(res.status).toBe(200);
    expect(res.body.data.maintenanceMode).toBe(true);
  });

  it("updates a string setting", async () => {
    const headers = await admin();
    const res = await request(app)
      .patch("/api/v1/admin/settings")
      .set(headers)
      .send({ settings: [{ key: "defaultLanguage", value: "fr" }] });
    expect(res.status).toBe(200);
    expect(res.body.data.defaultLanguage).toBe("fr");
  });

  it("rejects unknown setting keys", async () => {
    const headers = await admin();
    const res = await request(app)
      .patch("/api/v1/admin/settings")
      .set(headers)
      .send({ settings: [{ key: "nonExistentKey", value: "x" }] });
    expect(res.status).toBe(400);
  });

  it("rejects wrong type for boolean setting", async () => {
    const headers = await admin();
    const res = await request(app)
      .patch("/api/v1/admin/settings")
      .set(headers)
      .send({ settings: [{ key: "maintenanceMode", value: "not-a-boolean" }] });
    expect(res.status).toBe(400);
  });

  it("creates audit log on successful update", async () => {
    const headers = await admin();
    await request(app)
      .patch("/api/v1/admin/settings")
      .set(headers)
      .send({ settings: [{ key: "registrationEnabled", value: false }] });

    const auditLogs = await request(app).get("/api/v1/admin/audit-logs?action=settings.updated").set(headers);
    expect(auditLogs.body.pagination.total).toBeGreaterThanOrEqual(1);
  });
});
