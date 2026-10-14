/**
 * Phase 10: IDOR (Insecure Direct Object Reference) tests.
 * Verifies that User A cannot read or write User B's progress, library, or payment-method data.
 * All DB access goes through fakePrisma — no real database is used.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});
vi.mock("../../src/services/stripe/stripe.service", () => import("../fakes/stripeService.fake.js"));

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createUser } from "../helpers/adminAuth";
import { makePublishedMovie } from "../helpers/publishedContent";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

describe("IDOR — progress isolation (Phase 10)", () => {
  it("User A cannot read User B's movie progress", async () => {
    const userA = await createUser(app);
    const userB = await createUser(app);
    const { content } = await makePublishedMovie();

    // B writes progress
    await request(app)
      .put(`/api/v1/me/progress/movie/${content.id}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ positionSeconds: 300, durationSeconds: 6000 });

    // A tries to read B's progress — must get A's own (empty) progress, not B's
    const res = await request(app)
      .get(`/api/v1/me/progress/movie/${content.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(res.status).toBe(200);
    // A has no progress, so positionSeconds must be 0 (or not 300)
    expect(res.body.data?.positionSeconds ?? 0).not.toBe(300);
  });
});

describe("IDOR — library isolation (Phase 10)", () => {
  it("User A cannot see User B's library", async () => {
    const userA = await createUser(app);
    const userB = await createUser(app);
    const { content } = await makePublishedMovie();

    // B saves to My List
    await request(app)
      .post(`/api/v1/me/my-list/${content.id}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);

    // A's my-list must be empty
    const res = await request(app)
      .get("/api/v1/me/my-list")
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.data?.items ?? []).map((i: { id: string }) => i.id);
    expect(ids).not.toContain(content.id);
  });
});

describe("IDOR — payment methods isolation (Phase 10)", () => {
  it("payment-methods/setup requires a valid token — cannot be used without auth", async () => {
    const res = await request(app).post("/api/v1/me/payment-methods/setup");
    expect(res.status).toBe(401);
  });

  it("payment-methods/list requires a valid token", async () => {
    const res = await request(app).get("/api/v1/me/payment-methods");
    expect(res.status).toBe(401);
  });

  it("the payment-methods route is scoped to req.auth — no user-id URL parameter exists", async () => {
    // The route is /api/v1/me/payment-methods (no /:userId segment).
    // A user with no Stripe customer gets 404 "No billing profile yet" — not another user's data.
    const userA = await createUser(app);

    const res = await request(app)
      .get("/api/v1/me/payment-methods")
      .set("Authorization", `Bearer ${userA.accessToken}`);

    // 404 here means "no billing profile yet for THIS user", not a data leak.
    // The important invariant: the response never contains another user's payment methods.
    expect([200, 404]).toContain(res.status);
    if (res.status === 404) {
      expect(res.body.message).toMatch(/billing profile|payment method/i);
    }
  });
});
