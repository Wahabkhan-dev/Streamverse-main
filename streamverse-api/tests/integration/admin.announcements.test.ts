import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["RATE_LIMIT_MULTIPLIER"] = "100";
});
vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin, createUser } from "../helpers/adminAuth";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();
beforeEach(() => db.__reset());

describe("announcements: one message to every active customer", () => {
  it("reaches every customer's notifications, and is listed in the history", async () => {
    const one = await createUser(app);
    const two = await createUser(app);
    const admin = { Authorization: `Bearer ${(await createAdmin(app, db as never)).accessToken}` };

    const sent = await request(app).post("/api/v1/admin/announcements").set(admin).send({ kind: "NEW_RELEASE", title: "New season is here", message: "Watch it now" });
    expect(sent.status).toBe(201);
    expect(sent.body.data.recipients).toBe(2); // the two customers (not the administrator)

    for (const u of [one, two]) {
      const mine = await request(app).get("/api/v1/me/notifications").set({ Authorization: `Bearer ${u.accessToken}` });
      expect(mine.body.data.map((n: { title: string }) => n.title)).toContain("New season is here");
    }
    const history = await request(app).get("/api/v1/admin/announcements").set(admin);
    expect(history.body.data[0]).toMatchObject({ title: "New season is here", recipients: 2 });
  });

  it("an empty title is refused in words, and customers cannot send announcements", async () => {
    const customer = await createUser(app);
    const admin = { Authorization: `Bearer ${(await createAdmin(app, db as never)).accessToken}` };
    const bad = await request(app).post("/api/v1/admin/announcements").set(admin).send({ title: "  ", message: "x" });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/Add a title/);
    expect((await request(app).post("/api/v1/admin/announcements").set({ Authorization: `Bearer ${customer.accessToken}` }).send({ title: "Hi" })).status).toBe(403);
  });
});
