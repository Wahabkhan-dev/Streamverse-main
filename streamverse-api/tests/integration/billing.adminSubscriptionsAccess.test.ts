import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});
vi.mock("../../src/services/stripe/stripe.service", () => import("../fakes/stripeService.fake.js"));

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { createTestPlan } from "../helpers/billing";
import * as fakeStripe from "../fakes/stripeService.fake";
import { applyStripeSubscriptionSnapshot } from "../../src/services/billing/subscription.service.js";
import { makePublishedAudiobook, makePublishedEbook, makePublishedMovie } from "../helpers/publishedContent";
import { updateMovie } from "../../src/services/movie.service";
import { updateMovieSchema } from "../../src/validators/movie.validator";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();
const NO_ACTOR = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

beforeEach(() => {
  db.__reset();
  fakeStripe.__reset();
});

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

async function subscribedUser(plan: Awaited<ReturnType<typeof createTestPlan>>, status = "active") {
  const { accessToken, userId } = await createUser(app);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const customer = fakeStripe.__createFakeCustomer(`${userId}@example.com`, userId);
  await (prisma as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  const stripeSub = fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: plan.stripePriceId, userId, planId: plan.id, status });
  await applyStripeSubscriptionSnapshot(stripeSub as never);
  return { headers, userId };
}

describe("Admin subscription APIs (Section 49/50)", () => {
  it("lists subscriptions, filterable by status and plan, paginated", async () => {
    const plan = await createTestPlan();
    await subscribedUser(plan, "active");
    await subscribedUser(plan, "past_due");

    const headers = await admin();
    const all = await request(app).get("/api/v1/admin/subscriptions").set(headers);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.pagination.total).toBe(2);

    const activeOnly = await request(app).get("/api/v1/admin/subscriptions").query({ status: "PAST_DUE" }).set(headers);
    expect(activeOnly.body.data).toHaveLength(1);
    expect(activeOnly.body.data[0].status).toBe("PAST_DUE");
  });

  it("returns subscription detail with user/plan/period/cancel-state, never a secret", async () => {
    const plan = await createTestPlan();
    const { userId } = await subscribedUser(plan);
    const headers = await admin();

    const list = await request(app).get("/api/v1/admin/subscriptions").set(headers);
    const row = list.body.data.find((s: { userId: string }) => s.userId === userId);

    const detail = await request(app).get(`/api/v1/admin/subscriptions/${row.id}`).set(headers);
    expect(detail.status).toBe(200);
    expect(detail.body.data.plan.id).toBe(plan.id);
    expect(detail.body.data.user.id).toBe(userId);
    expect(JSON.stringify(detail.body)).not.toMatch(/sk_test_|sk_live_/i);
  });

  it("USER cannot list or view subscriptions", async () => {
    const { accessToken } = await createUser(app);
    const headers = { Authorization: `Bearer ${accessToken}` };
    expect((await request(app).get("/api/v1/admin/subscriptions").set(headers)).status).toBe(403);
  });
});

describe("Real subscription access integration (Section 59/60/97/108)", () => {
  it("movie playback: no subscription -> denied, active subscription -> allowed", async () => {
    const plan = await createTestPlan();
    const { content } = await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" });
    const masterAsset = await (prisma as unknown as { mediaAsset: { create: (a: unknown) => Promise<{ id: string }> } }).mediaAsset.create({
      data: { type: "MOVIE_MASTER", contentId: content.id, status: "READY", hlsManifestKey: `content/${content.id}/hls/master.m3u8` },
    });
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { masterAssetId: masterAsset.id } }), NO_ACTOR);

    const { accessToken: noSubToken } = await createUser(app);
    const denied = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set("Authorization", `Bearer ${noSubToken}`);
    expect(denied.body.data.access).toMatchObject({ canConsume: false, reason: "SUBSCRIPTION_REQUIRED" });
    expect(denied.body.data.playback).toBeNull();

    const { headers } = await subscribedUser(plan, "active");
    const allowed = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(allowed.body.data.access.canConsume).toBe(true);
    expect(allowed.body.data.playback.url).toBeTruthy();
  });

  it("audiobook and eBook access follow the same real subscription rule", async () => {
    const plan = await createTestPlan();
    const { content: audiobookContent } = await makePublishedAudiobook({ visibility: "SUBSCRIBERS_ONLY" });
    const { content: ebookContent } = await makePublishedEbook({ visibility: "SUBSCRIBERS_ONLY" });

    const { accessToken: noSubToken } = await createUser(app);
    const noSubHeaders = { Authorization: `Bearer ${noSubToken}` };
    const deniedAudio = await request(app).post(`/api/v1/media/audiobooks/${audiobookContent.id}/playback`).set(noSubHeaders);
    expect(deniedAudio.body.data.access.canConsume).toBe(false);
    const deniedEbook = await request(app).post(`/api/v1/media/ebooks/${ebookContent.id}/access`).set(noSubHeaders);
    expect(deniedEbook.body.data.access.canConsume).toBe(false);

    const { headers } = await subscribedUser(plan, "active");
    const allowedAudio = await request(app).post(`/api/v1/media/audiobooks/${audiobookContent.id}/playback`).set(headers);
    expect(allowedAudio.body.data.access.canConsume).toBe(true);
    const allowedEbook = await request(app).post(`/api/v1/media/ebooks/${ebookContent.id}/access`).set(headers);
    expect(allowedEbook.body.data.access.canConsume).toBe(true);
  });

  it("a subscription canceled at period end (still within the period) keeps access until Stripe says otherwise", async () => {
    const plan = await createTestPlan();
    const { content } = await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" });
    const { headers, userId } = await subscribedUser(plan, "active");
    await request(app).post("/api/v1/me/subscription/cancel").set(headers);

    const { hasActiveAccess } = await import("../../src/services/billing/subscriptionAccess.service.js");
    expect(await hasActiveAccess(userId)).toBe(true); // status is still ACTIVE — cancelAtPeriodEnd alone doesn't revoke access
    void content;
  });
});
