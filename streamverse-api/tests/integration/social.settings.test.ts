import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin } from "../helpers/adminAuth";

const db = prisma as unknown as { __reset: () => void; user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> } };
const app = createApp();
beforeEach(() => db.__reset());

describe("social media links (footer)", () => {
  it("an admin saves them, anyone can read them, and an empty value hides one", async () => {
    const { accessToken } = await createAdmin(app, db);
    const put = (key: string, value: unknown) => request(app).put(`/api/v1/admin/settings/${key}`).set("Authorization", `Bearer ${accessToken}`).send({ value });
    expect((await put("socialYoutube", "https://www.youtube.com/@streamverse")).status).toBe(200);
    expect((await put("socialX", "https://x.com/streamverse")).status).toBe(200);
    const pub = await request(app).get("/api/v1/settings/public");
    expect(pub.body.data).toMatchObject({ socialYoutube: "https://www.youtube.com/@streamverse", socialX: "https://x.com/streamverse", socialInstagram: "", socialFacebook: "" });
    expect((await put("socialX", "")).status).toBe(200);
    expect((await request(app).get("/api/v1/settings/public")).body.data.socialX).toBe("");
  });

  it("refuses anything that is not a web address (it ends up in a link)", async () => {
    const { accessToken } = await createAdmin(app, db);
    for (const bad of ["javascript:alert(1)", "youtube.com/me", "https://a b.com", `https://x.com/${"a".repeat(300)}`, 5, true]) {
      const res = await request(app).put("/api/v1/admin/settings/socialInstagram").set("Authorization", `Bearer ${accessToken}`).send({ value: bad });
      expect(res.status, String(bad)).toBe(400);
    }
  });
});
