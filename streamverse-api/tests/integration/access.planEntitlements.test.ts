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
import { checkAccess } from "../../src/services/entitlement/entitlement.service";
import { createUser } from "../helpers/adminAuth";
import { createTestPlan } from "../helpers/billing";
import { makePublishedAudiobook, makePublishedEbook, makePublishedMovie } from "../helpers/publishedContent";

const db = prisma as unknown as { __reset: () => void; subscription: { create: (a: unknown) => Promise<unknown> } };
const app = createApp();
beforeEach(() => db.__reset());

async function subscriber(planOverrides: Record<string, unknown>) {
  const { userId } = await createUser(app);
  const plan = await createTestPlan(planOverrides);
  await db.subscription.create({ data: { userId, planId: plan.id, stripeCustomerId: `cus_${userId}`, stripeSubscriptionId: `sub_${userId}`, stripePriceId: plan.stripePriceId, status: "ACTIVE" } });
  return userId;
}

describe("a plan only unlocks the kinds of content it includes", () => {
  it("a movies-only plan plays movies but is refused eBooks and audiobooks, with a clear reason", async () => {
    const userId = await subscriber({ moviesEnabled: true, ebooksEnabled: false, audiobooksEnabled: false });
    const movie = (await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" })).content;
    const ebook = (await makePublishedEbook({ visibility: "SUBSCRIBERS_ONLY" })).content;
    const audio = (await makePublishedAudiobook({ visibility: "SUBSCRIBERS_ONLY" })).content;
    const ask = (id: string, type: "movie" | "ebook" | "audiobook") => checkAccess({ userId, role: "USER" } as never, id, type);
    expect((await ask(movie.id, "movie")).allowed).toBe(true);
    expect(await ask(ebook.id, "ebook")).toMatchObject({ allowed: false, reason: "PLAN_NOT_ELIGIBLE" });
    expect(await ask(audio.id, "audiobook")).toMatchObject({ allowed: false, reason: "PLAN_NOT_ELIGIBLE" });
  });

  it("a full plan unlocks all three", async () => {
    const userId = await subscriber({});
    const ebook = (await makePublishedEbook({ visibility: "SUBSCRIBERS_ONLY" })).content;
    expect((await checkAccess({ userId, role: "USER" } as never, ebook.id, "ebook")).allowed).toBe(true);
  });

  it("the public plan list shows what each plan includes, with null meaning unlimited", async () => {
    await createTestPlan({ maxDevices: null, maxConcurrentStreams: 2, maxVideoQuality: "1080p" });
    const res = await request(app).get("/api/v1/plans");
    expect(res.body.data[0]).toMatchObject({ maxDevices: null, maxConcurrentStreams: 2, maxVideoQuality: "1080p", moviesEnabled: true });
  });
});
