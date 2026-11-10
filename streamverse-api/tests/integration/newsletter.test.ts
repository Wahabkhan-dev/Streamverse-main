import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";

const app = createApp();
const fake = prisma as unknown as { __reset: () => void; newsletterSubscriber: { all: () => { email: string }[] } };
beforeEach(() => fake.__reset());

describe("POST /api/v1/newsletter/subscribe", () => {
  it("signs an address up once, lower-cased, and answers the same the second time", async () => {
    const first = await request(app).post("/api/v1/newsletter/subscribe").send({ email: "  Fan@Example.com " });
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ subscribed: true });
    const again = await request(app).post("/api/v1/newsletter/subscribe").send({ email: "fan@example.com" });
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual({ subscribed: true });
    expect(fake.newsletterSubscriber.all().map((r) => r.email)).toEqual(["fan@example.com"]);
  });

  it("refuses something that is not an email address", async () => {
    expect((await request(app).post("/api/v1/newsletter/subscribe").send({ email: "nope" })).status).toBe(400);
    expect((await request(app).post("/api/v1/newsletter/subscribe").send({})).status).toBe(400);
  });
});
