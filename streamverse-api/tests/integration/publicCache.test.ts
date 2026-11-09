import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// caching ON for this file (the suite default is 0 = off)
vi.hoisted(() => {
  process.env["HOMEPAGE_CACHE_TTL_SECONDS"] = "30";
});

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});
vi.mock("../../src/services/stripe/stripe.service", () => import("../fakes/stripeService.fake.js"));

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import * as bannerService from "../../src/services/banner.service";
import * as collectionService from "../../src/services/collection.service";
import * as genreService from "../../src/services/genre.service";
import { ensureDocument } from "../../src/services/legal.service";
import { applyStripeSubscriptionSnapshot } from "../../src/services/billing/subscription.service";
import { analyticsCache } from "../../src/utils/analyticsCache";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { createTestPlan } from "../helpers/billing";
import { makePublishedMovie } from "../helpers/publishedContent";
import * as fakeStripe from "../fakes/stripeService.fake";

type Db = { __reset: () => void; user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> } };
const db = prisma as unknown as Db;
const app = createApp();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  db.__reset();
  fakeStripe.__reset();
  analyticsCache.invalidate();
  await ensureDocument("REFUND_POLICY");
});

const admin = async () => `Bearer ${(await createAdmin(app, db)).accessToken}`;
const bannerTitles = async () => (await request(app).get("/api/v1/banners")).body.data.map((b: { title: string }) => b.title);
const genreNames = async () => (await request(app).get("/api/v1/genres")).body.data.map((g: { name: string }) => g.name);

describe("public caches: served from cache, and an admin change shows immediately", () => {
  it("banners", async () => {
    await bannerService.createBanner({ type: "NORMAL", title: "First", priority: 1, active: true } as never);
    expect(await bannerTitles()).toEqual(["First"]);
    await bannerService.createBanner({ type: "NORMAL", title: "Behind the cache", priority: 2, active: true } as never); // not through admin HTTP
    expect(await bannerTitles()).toEqual(["First"]); // still the cached copy

    const auth = await admin();
    const created = await request(app).post("/api/v1/admin/banners").set("Authorization", auth).send({ type: "NORMAL", title: "Admin Banner", priority: 3, active: true });
    expect(created.status).toBe(201);
    expect(await bannerTitles()).toEqual(["First", "Behind the cache", "Admin Banner"]);
  });

  it("banners: a cached list never outlives a banner's end time, nor hides one past its start time", async () => {
    await bannerService.createBanner({ type: "HERO", title: "Always", priority: 1, active: true } as never);
    await bannerService.createBanner({ type: "HERO", title: "Ends soon", priority: 2, active: true, endsAt: new Date(Date.now() + 400) } as never);
    await bannerService.createBanner({ type: "HERO", title: "Starts soon", priority: 3, active: true, startsAt: new Date(Date.now() + 400) } as never);
    expect(await bannerTitles()).toEqual(["Always", "Ends soon"]);
    await wait(550); // well inside the 30 s cache time, but past both boundaries
    expect(await bannerTitles()).toEqual(["Always", "Starts soon"]);
  });

  it("genres", async () => {
    await genreService.createGenre({ name: "Drama" } as never);
    expect(await genreNames()).toEqual(["Drama"]);
    await genreService.createGenre({ name: "Behind" } as never);
    expect(await genreNames()).toEqual(["Drama"]);
    const created = await request(app).post("/api/v1/admin/genres").set("Authorization", await admin()).send({ name: "Noir" });
    expect(created.status).toBe(201);
    expect((await genreNames()).sort()).toEqual(["Behind", "Drama", "Noir"]);
  });

  it("legal page: publishing a new version shows it at once (and a draft never shows)", async () => {
    const auth = await admin();
    expect((await request(app).get("/api/v1/legal/refund-policy")).status).toBe(404);
    await request(app).post("/api/v1/admin/legal/REFUND_POLICY/draft").set("Authorization", auth).send({ title: "Refunds", content: "<p>v1</p>", version: "1.0" });
    expect((await request(app).get("/api/v1/legal/refund-policy")).status).toBe(404); // draft only
    await request(app).post("/api/v1/admin/legal/REFUND_POLICY/publish").set("Authorization", auth);
    expect((await request(app).get("/api/v1/legal/refund-policy")).body.data.version).toBe("1.0");
    await request(app).post("/api/v1/admin/legal/REFUND_POLICY/draft").set("Authorization", auth).send({ title: "Refunds", content: "<p>v2</p>", version: "2.0" });
    expect((await request(app).get("/api/v1/legal/refund-policy")).body.data.version).toBe("1.0"); // the draft is not published
    await request(app).post("/api/v1/admin/legal/REFUND_POLICY/publish").set("Authorization", auth);
    const page = await request(app).get("/api/v1/legal/refund-policy");
    expect(page.body.data.version).toBe("2.0");
    expect(page.body.data.content).toBe("<p>v2</p>");
  });

  it("one collection page", async () => {
    const auth = await admin();
    const c = await collectionService.createCollection({ name: "Staff Picks" } as never);
    await collectionService.updateCollection(c.id, { status: "PUBLISHED" } as never);
    const first = await request(app).get(`/api/v1/collections/${c.slug}`);
    expect(first.body.data.name).toBe("Staff Picks");
    const renamed = await request(app).put(`/api/v1/admin/collections/${c.id}`).set("Authorization", auth).send({ name: "Weekend Picks" });
    expect(renamed.status).toBe(200);
    expect((await request(app).get(`/api/v1/collections/${c.slug}`)).body.data.name).toBe("Weekend Picks");
  });

  it("search suggestions", async () => {
    await makePublishedMovie({ title: "Lantern Night" });
    const labels = async () => (await request(app).get("/api/v1/search/suggestions?q=Lantern")).body.data.map((s: { label: string }) => s.label);
    expect(await labels()).toEqual(["Lantern Night"]);
    await makePublishedMovie({ title: "Lantern Dawn" });
    expect(await labels()).toEqual(["Lantern Night"]);
    await request(app).post("/api/v1/admin/genres").set("Authorization", await admin()).send({ name: "Any change" });
    expect((await labels()).sort()).toEqual(["Lantern Dawn", "Lantern Night"]);
  });
});

describe("cached public data never carries one user's private data to another", () => {
  async function subscriber() {
    const plan = await createTestPlan();
    const { accessToken, userId, email } = await createUser(app);
    const customer = fakeStripe.__createFakeCustomer(`user-${userId}@test.com`, userId);
    await db.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
    await applyStripeSubscriptionSnapshot(fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: plan.stripePriceId, userId, planId: plan.id, status: "active" }) as never);
    return { accessToken, userId, email };
  }

  it("user A (subscribed) and user B (not) share the cached title page but each gets their OWN access", async () => {
    const { content } = await makePublishedMovie({ title: "Members Movie", visibility: "SUBSCRIBERS_ONLY" });
    const a = await subscriber();
    const b = await createUser(app);
    const detail = (token?: string) => request(app).get(`/api/v1/movies/${content.slug}`).set(token ? { Authorization: `Bearer ${token}` } : {});

    const a1 = await detail(a.accessToken); // fills the shared cache as A
    const b1 = await detail(b.accessToken);
    const anon = await detail();
    const a2 = await detail(a.accessToken);
    expect(a1.body.data.access.canConsume).toBe(true);
    expect(b1.body.data.access.canConsume).toBe(false);
    expect(anon.body.data.access.canConsume).toBe(false);
    expect(a2.body.data.access.canConsume).toBe(true);
    for (const res of [b1, anon]) {
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(a.userId);
      expect(text).not.toContain(a.email);
    }
  });

  it("every shared public endpoint returns the same bytes to A, B and an anonymous visitor, with no user ids or emails in them", async () => {
    const { content } = await makePublishedMovie({ title: "Lantern Shared" });
    const c = await collectionService.createCollection({ name: "Shared Picks" } as never);
    await collectionService.updateCollection(c.id, { status: "PUBLISHED" } as never);
    await collectionService.addItem(c.id, { contentId: content.id } as never);
    await bannerService.createBanner({ type: "HERO", title: "Shared Banner", priority: 1, active: true } as never);
    await genreService.createGenre({ name: "Shared Genre" } as never);
    const a = await subscriber();
    const b = await createUser(app);
    // A has private state that must never appear in a shared response
    await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set("Authorization", `Bearer ${a.accessToken}`).send({ positionSeconds: 30, durationSeconds: 600 });

    for (const path of ["/api/v1/banners", "/api/v1/genres", `/api/v1/collections/${c.slug}`, "/api/v1/search/suggestions?q=Lantern", "/api/v1/homepage", "/api/v1/collections"]) {
      const asA = await request(app).get(path).set("Authorization", `Bearer ${a.accessToken}`);
      const asB = await request(app).get(path).set("Authorization", `Bearer ${b.accessToken}`);
      const asAnon = await request(app).get(path);
      expect(asA.status, path).toBe(200);
      expect(JSON.stringify(asB.body.data), path).toBe(JSON.stringify(asA.body.data));
      expect(JSON.stringify(asAnon.body.data), path).toBe(JSON.stringify(asA.body.data));
      for (const secret of [a.userId, a.email, b.userId, b.email]) expect(JSON.stringify(asA.body), path).not.toContain(secret);
    }
  });
});
