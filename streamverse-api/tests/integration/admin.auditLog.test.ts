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
  auditLog: { findMany: (a: unknown) => Promise<{ action: string; entityType: string; entityId: string | null; userId: string | null; requestId: string | null }[]> };
};
const app = createApp();
const auditEntries = () => db.auditLog.findMany({});

beforeEach(() => db.__reset());

describe("audit log", () => {
  it("records who did it (userId), what (action/entityType/entityId), and carries a requestId", async () => {
    const { accessToken, userId } = await createAdmin(app, db);
    const created = await request(app).post("/api/v1/admin/genres").set("Authorization", `Bearer ${accessToken}`).send({ name: "Noir" });

    const entries = await auditEntries();
    const entry = entries.find((e) => e.action === "genre.created");
    expect(entry).toBeTruthy();
    expect(entry!.entityType).toBe("GENRE");
    expect(entry!.entityId).toBe(created.body.data.id);
    expect(entry!.userId).toBe(userId);
    expect(entry!.requestId).toBeTruthy();
  });

  it("every kind of admin change this phase introduces is represented", async () => {
    const { accessToken } = await createAdmin(app, db);
    await request(app).post("/api/v1/admin/movies").set("Authorization", `Bearer ${accessToken}`).send({ title: "Audited Movie" });
    await request(app).post("/api/v1/admin/collections").set("Authorization", `Bearer ${accessToken}`).send({ name: "Audited Collection" });
    await request(app).post("/api/v1/admin/homepage/sections").set("Authorization", `Bearer ${accessToken}`).send({ key: "audited_section", displayTitle: "Audited", type: "MANUAL" });
    await request(app).post("/api/v1/admin/banners").set("Authorization", `Bearer ${accessToken}`).send({ type: "HERO", placement: "MOVIES", title: "Audited Banner" });
    await request(app).put("/api/v1/admin/settings/registrationEnabled").set("Authorization", `Bearer ${accessToken}`).send({ value: false });

    const actions = (await auditEntries()).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(["content.created", "collection.created", "homepage.section_created", "banner.created", "settings.updated"]),
    );
  });

  it("does not record a failed attempt as if it succeeded", async () => {
    const { accessToken } = await createAdmin(app, db);
    const res = await request(app).post("/api/v1/admin/genres").set("Authorization", `Bearer ${accessToken}`).send({ name: "" }); // invalid
    expect(res.status).toBe(400);
    const entries = await auditEntries();
    expect(entries.some((e) => e.action === "genre.created")).toBe(false);
  });
});
