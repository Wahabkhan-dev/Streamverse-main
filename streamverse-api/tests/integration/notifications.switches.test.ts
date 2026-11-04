import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["RATE_LIMIT_MULTIPLIER"] = "100";
});
vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});
vi.mock("../../src/services/stripe/stripe.service", () => import("../fakes/stripeService.fake.js"));
// publishing needs real media attached in production; these tests are about who is told, not about publish readiness
vi.mock("../../src/services/contentPublishValidation.service", () => ({ assertReadyToPublish: async () => undefined }));

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { publishContent } from "../../src/services/contentStatus.service";
import { createMovie } from "../../src/services/movie.service";
import { setSetting } from "../../src/services/settings.service";
import { createMovieSchema } from "../../src/validators/movie.validator";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { createTestPlan } from "../helpers/billing";
import * as fakeStripe from "../fakes/stripeService.fake";
import { applyStripeSubscriptionSnapshot } from "../../src/services/billing/subscription.service";

const db = prisma as unknown as { __reset: () => void; notification: { findMany: (a?: unknown) => Promise<{ userId: string; type: string; title: string; message: string }[]> } };
const app = createApp();

beforeEach(() => {
  db.__reset();
  fakeStripe.__reset();
});

const ctx = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };
const tick = () => new Promise((r) => setTimeout(r, 25));

async function draftMovie(title: string) {
  const { content } = await createMovie(createMovieSchema.parse({ title }));
  return content;
}

async function subscriber() {
  const { accessToken, userId } = await createUser(app);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const customer = fakeStripe.__createFakeCustomer(`${userId}@example.com`, userId);
  await (prisma as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  const basic = await createTestPlan({ name: "Basic", priceAmount: 499 });
  const premium = await createTestPlan({ name: "Premium", priceAmount: 1499 });
  const stripeSub = fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: basic.stripePriceId, userId, planId: basic.id, status: "active" });
  await applyStripeSubscriptionSnapshot(stripeSub as never);
  return { headers, userId, premium, stripeSub };
}

describe("Admin -> Settings -> New content alerts", () => {
  it("off (the default): publishing a title tells nobody", async () => {
    await createUser(app);
    const movie = await draftMovie("Quiet Release");
    await publishContent("MOVIE", movie.id, ctx);
    await tick();
    expect((await db.notification.findMany()).filter((n) => n.type === "NEW_RELEASE")).toHaveLength(0);
  });

  it("on: the first publish alerts every active customer (not admins), and republishing does not alert again", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    await createAdmin(app, db as never);
    await setSetting({ key: "newContentAlerts", value: true });
    const movie = await draftMovie("Big Release");
    await publishContent("MOVIE", movie.id, ctx);
    await tick();
    const alerts = (await db.notification.findMany()).filter((n) => n.type === "NEW_RELEASE");
    expect(alerts.map((n) => n.userId).sort()).toEqual([a.userId, b.userId].sort());
    expect(alerts[0]!.message).toContain("Big Release");

    await publishContent("MOVIE", movie.id, ctx); // already live: edited and saved again
    await tick();
    expect((await db.notification.findMany()).filter((n) => n.type === "NEW_RELEASE")).toHaveLength(2);
  });
});

describe("Admin -> Settings -> Billing notifications", () => {
  it("on (the default): a plan change adds a notification for the customer", async () => {
    const { headers, premium } = await subscriber();
    await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: premium.id, consent: true });
    expect((await db.notification.findMany()).some((n) => n.title === "Plan changed")).toBe(true);
  });

  it("off: the plan change still happens but the customer gets no bell alert", async () => {
    const { headers, premium } = await subscriber();
    await setSetting({ key: "billingNotifications", value: false });
    const res = await request(app).post("/api/v1/me/subscription/change-plan").set(headers).send({ planId: premium.id, consent: true });
    expect(res.status).toBe(200);
    expect(res.body.data.plan.id).toBe(premium.id);
    expect((await db.notification.findMany()).filter((n) => n.type === "SUBSCRIPTION")).toHaveLength(0);
  });
});

describe("Retry payment (a failed renewal)", () => {
  async function pastDue() {
    const s = await subscriber();
    fakeStripe.__setSubscriptionStatus(s.stripeSub.id, "past_due");
    await applyStripeSubscriptionSnapshot((await fakeStripe.retrieveSubscription(s.stripeSub.id)) as never);
    return s;
  }

  it("charges the open invoice again and the subscription becomes active", async () => {
    const { headers } = await pastDue();
    expect((await request(app).get("/api/v1/me/subscription").set(headers)).body.data.status).toBe("PAST_DUE");
    const res = await request(app).post("/api/v1/me/subscription/retry-payment").set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ACTIVE");
  });

  it("a card declined again changes nothing and says so", async () => {
    const { headers } = await pastDue();
    fakeStripe.__declineNextCharge();
    const res = await request(app).post("/api/v1/me/subscription/retry-payment").set(headers);
    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/declined again/);
    expect((await request(app).get("/api/v1/me/subscription").set(headers)).body.data.status).toBe("PAST_DUE");
  });

  it("is refused when nothing failed", async () => {
    const { headers } = await subscriber();
    expect((await request(app).post("/api/v1/me/subscription/retry-payment").set(headers)).status).toBe(409);
  });
});

describe("Admin -> Users -> one customer's real activity", () => {
  it("returns their real subscription, payments, library and history (nothing generated), and 404s for an unknown user", async () => {
    const { userId } = await subscriber();
    const { accessToken } = await createAdmin(app, db as never);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const res = await request(app).get(`/api/v1/admin/users/${userId}/activity`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.subscription).toMatchObject({ status: "ACTIVE", plan: { name: "Basic", priceAmount: 499 } });
    expect(res.body.data.payments).toEqual([]);
    expect(res.body.data.library).toEqual([]);
    expect(res.body.data.history).toEqual([]);
    expect((await request(app).get("/api/v1/admin/users/nope/activity").set(headers)).status).toBe(404);
    const normal = await createUser(app);
    expect((await request(app).get(`/api/v1/admin/users/${userId}/activity`).set({ Authorization: `Bearer ${normal.accessToken}` })).status).toBe(403);
  });
});

describe("Admin -> Notifications -> Send announcement", () => {
  it("reaches every active customer's bell (not admins), is admin-only, and validates the title", async () => {
    const a = await createUser(app);
    const b = await createUser(app);
    const { accessToken, userId: adminId } = await createAdmin(app, db as never);
    const headers = { Authorization: `Bearer ${accessToken}` };

    const res = await request(app).post("/api/v1/admin/notifications/announce").set(headers).send({ kind: "ACCOUNT", title: "Scheduled maintenance", message: "Sunday 2am" });
    expect(res.status).toBe(201);
    expect(res.body.data.sent).toBe(2);
    const got = (await db.notification.findMany()).filter((n) => n.title === "Scheduled maintenance");
    expect(got.map((n) => n.userId).sort()).toEqual([a.userId, b.userId].sort());
    expect(got.some((n) => n.userId === adminId)).toBe(false);
    expect(got[0]).toMatchObject({ type: "ACCOUNT", message: "Sunday 2am" });

    expect((await request(app).post("/api/v1/admin/notifications/announce").set(headers).send({ kind: "ACCOUNT", title: "  " })).status).toBe(400);
    expect((await request(app).post("/api/v1/admin/notifications/announce").set(headers).send({ kind: "HACK", title: "x" })).status).toBe(400);
    expect((await request(app).post("/api/v1/admin/notifications/announce").set({ Authorization: `Bearer ${a.accessToken}` }).send({ kind: "ACCOUNT", title: "x" })).status).toBe(403);
  });
});
