import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { ensureDocument } from "../../src/services/legal.service";
import { createAdmin, createUser } from "../helpers/adminAuth";

const db = prisma as unknown as { __reset: () => void; user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> } };
const app = createApp();

beforeEach(async () => {
  db.__reset();
  await ensureDocument("PRIVACY_POLICY");
  await ensureDocument("TERMS_AND_CONDITIONS");
  await ensureDocument("REFUND_POLICY");
});

for (const [type, path] of [
  ["PRIVACY_POLICY", "privacy-policy"],
  ["TERMS_AND_CONDITIONS", "terms-and-conditions"],
  ["REFUND_POLICY", "refund-policy"],
] as const) {
  describe(`admin legal: ${type}`, () => {
    it("saves a draft without changing the published version, then publishes it; version history is kept", async () => {
      const { accessToken } = await createAdmin(app, db);

      const draft1 = await request(app).post(`/api/v1/admin/legal/${type}/draft`).set("Authorization", `Bearer ${accessToken}`).send({ title: "T", content: "<p>v1</p>", version: "1.0" });
      expect(draft1.status).toBe(200);
      await request(app).post(`/api/v1/admin/legal/${type}/publish`).set("Authorization", `Bearer ${accessToken}`);

      const draft2 = await request(app).post(`/api/v1/admin/legal/${type}/draft`).set("Authorization", `Bearer ${accessToken}`).send({ title: "T", content: "<p>v2 in progress</p>", version: "2.0" });
      expect(draft2.status).toBe(200);

      const doc = await request(app).get(`/api/v1/admin/legal/${type}`).set("Authorization", `Bearer ${accessToken}`);
      expect(doc.body.data.currentPublishedVersion.content).toBe("<p>v1</p>");
      expect(doc.body.data.currentDraftVersion.content).toBe("<p>v2 in progress</p>");

      const preview = await request(app).get(`/api/v1/admin/legal/${type}/preview`).set("Authorization", `Bearer ${accessToken}`);
      expect(preview.body.data.content).toBe("<p>v2 in progress</p>"); // preview shows the draft, not what's live

      const published2 = await request(app).post(`/api/v1/admin/legal/${type}/publish`).set("Authorization", `Bearer ${accessToken}`);
      expect(published2.body.data.content).toBe("<p>v2 in progress</p>");

      const versions = await request(app).get(`/api/v1/admin/legal/${type}/versions`).set("Authorization", `Bearer ${accessToken}`);
      expect(versions.body.data).toHaveLength(2);
      expect(versions.body.data.map((v: { version: string }) => v.version).sort()).toEqual(["1.0", "2.0"]);
    });

    it("rejects an invalid version string", async () => {
      const { accessToken } = await createAdmin(app, db);
      const res = await request(app).post(`/api/v1/admin/legal/${type}/draft`).set("Authorization", `Bearer ${accessToken}`).send({ title: "T", content: "<p>x</p>", version: "not-a-version" });
      expect(res.status).toBe(400);
    });
  });
}

describe("admin legal: type safety", () => {
  it("rejects an arbitrary legal type", async () => {
    const { accessToken } = await createAdmin(app, db);
    const res = await request(app).get("/api/v1/admin/legal/MADE_UP_TYPE").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
  });
});

describe("admin legal: protection", () => {
  it("requires ADMIN", async () => {
    const { accessToken } = await createUser(app);
    expect((await request(app).get("/api/v1/admin/legal").set("Authorization", `Bearer ${accessToken}`)).status).toBe(403);
  });
});

describe("admin settings", () => {
  it("updates a valid known setting", async () => {
    const { accessToken } = await createAdmin(app, db);
    const res = await request(app).put("/api/v1/admin/settings/maintenanceMode").set("Authorization", `Bearer ${accessToken}`).send({ value: true });
    expect(res.status).toBe(200);
    expect(res.body.data.maintenanceMode).toBe(true);
  });

  it("rejects an unknown key", async () => {
    const { accessToken } = await createAdmin(app, db);
    const res = await request(app).put("/api/v1/admin/settings/notARealSetting").set("Authorization", `Bearer ${accessToken}`).send({ value: true });
    expect(res.status).toBe(400);
  });

  it("rejects the wrong type for a known key", async () => {
    const { accessToken } = await createAdmin(app, db);
    const res = await request(app).put("/api/v1/admin/settings/maintenanceMode").set("Authorization", `Bearer ${accessToken}`).send({ value: "yes-please" });
    expect(res.status).toBe(400);
  });

  it("a settings update writes an audit record with oldValue/newValue", async () => {
    const { accessToken } = await createAdmin(app, db);
    await request(app).put("/api/v1/admin/settings/maintenanceMode").set("Authorization", `Bearer ${accessToken}`).send({ value: false });
    await request(app).put("/api/v1/admin/settings/maintenanceMode").set("Authorization", `Bearer ${accessToken}`).send({ value: true });
    const logs = await (prisma as unknown as { auditLog: { findMany: (a: unknown) => Promise<{ action: string; metadata: unknown }[]> } }).auditLog.findMany({ where: { action: "settings.updated" }, orderBy: { createdAt: "asc" } });
    expect(logs).toHaveLength(2);
    expect(logs[1]!.metadata).toMatchObject({ oldValue: false, newValue: true });
  });
});
