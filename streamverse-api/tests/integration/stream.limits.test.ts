/**
 * Concurrent stream-limit integration tests.
 * Tests the `playbackSession.service` layer directly (the service throws ForbiddenError; the media-access
 * controller intentionally catches it so playback still proceeds — we test the service contract here).
 * eBook exclusion is verified via the HTTP media-access endpoint.
 *
 * Note: if the DB migration hasn't run yet the fake-Prisma tables cover all operations in memory.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createUser } from "../helpers/adminAuth";
import { createTestPlan } from "../helpers/billing";
import { startPlaybackSession, endPlaybackSession } from "../../src/services/playbackSession.service";
import { makePublishedMovie, makePublishedEbook, makePublishedAudiobook } from "../helpers/publishedContent";

const db = prisma as unknown as {
  __reset: () => void;
  subscription: { create: (a: unknown) => Promise<unknown> };
  playbackSession: { update: (a: unknown) => Promise<unknown> };
};
const app = createApp();
beforeEach(() => db.__reset());

/** Directly wires a userId to a planId without Stripe. */
async function attachPlanToUser(userId: string, planId: string) {
  await (db.subscription as unknown as { create: (a: unknown) => Promise<unknown> }).create({
    data: {
      userId,
      planId,
      status: "ACTIVE",
      stripeSubscriptionId: `fake_sub_${Math.random().toString(36).slice(2)}`,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

// ─────────────────────────────────────────────────────────────
describe("Stream limits — maxConcurrentStreams = null (unlimited)", () => {
  it("allows starting many concurrent sessions when the plan sets no cap", async () => {
    const plan = await createTestPlan({ maxConcurrentStreams: null });
    const { userId } = await createUser(app);
    await attachPlanToUser(userId, plan.id);

    // Start 5 sessions concurrently — none should throw
    for (let i = 0; i < 5; i++) {
      await expect(
        startPlaybackSession(userId, `content-${i}`, "MOVIE"),
      ).resolves.toMatchObject({ sessionId: expect.any(String) });
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe("Stream limits — maxConcurrentStreams = 1", () => {
  it("allows the first stream but the second movie throws CONCURRENT_STREAM_LIMIT_REACHED", async () => {
    const plan = await createTestPlan({ maxConcurrentStreams: 1 });
    const { userId } = await createUser(app);
    await attachPlanToUser(userId, plan.id);

    // First stream — must succeed
    await expect(
      startPlaybackSession(userId, "content-a", "MOVIE"),
    ).resolves.toMatchObject({ sessionId: expect.any(String) });

    // Second stream — must be rejected
    await expect(
      startPlaybackSession(userId, "content-b", "MOVIE"),
    ).rejects.toThrow("CONCURRENT_STREAM_LIMIT_REACHED");
  });

  it("both MOVIE and AUDIOBOOK consume a stream slot", async () => {
    const plan = await createTestPlan({ maxConcurrentStreams: 1 });
    const { userId } = await createUser(app);
    await attachPlanToUser(userId, plan.id);

    // Movie occupies the slot
    await startPlaybackSession(userId, "content-movie", "MOVIE");

    // Audiobook also counts as a stream — must be rejected
    await expect(
      startPlaybackSession(userId, "content-audio", "AUDIOBOOK"),
    ).rejects.toThrow("CONCURRENT_STREAM_LIMIT_REACHED");
  });

  it("eBook does NOT consume a stream slot and can always be opened", async () => {
    const plan = await createTestPlan({ maxConcurrentStreams: 1 });
    const { userId } = await createUser(app);
    await attachPlanToUser(userId, plan.id);

    // Fill the only stream slot with a movie
    await startPlaybackSession(userId, "content-movie", "MOVIE");

    // eBook must succeed even though the slot is full
    await expect(
      startPlaybackSession(userId, "content-ebook", "EBOOK"),
    ).resolves.toMatchObject({ sessionId: expect.any(String) });
  });
});

// ─────────────────────────────────────────────────────────────
describe("eBook stream exclusion via HTTP endpoint", () => {
  it("eBook access endpoint does not count toward concurrent-stream limit", async () => {
    const plan = await createTestPlan({ maxConcurrentStreams: 1 });
    const { accessToken, userId } = await createUser(app);
    const headers = { Authorization: `Bearer ${accessToken}` };
    await attachPlanToUser(userId, plan.id);

    // Fill the only stream slot via the service
    await startPlaybackSession(userId, "some-content", "MOVIE");

    // eBook access via HTTP must still succeed
    const { content } = await makePublishedEbook();
    const res = await request(app).post(`/api/v1/media/ebooks/${content.id}/access`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
describe("Stale session expiry", () => {
  it("an ACTIVE session whose lastHeartbeatAt is past the timeout is expired and frees the slot", async () => {
    // Use a very short timeout for this test via env var (or manipulate data directly)
    const plan = await createTestPlan({ maxConcurrentStreams: 1 });
    const { userId } = await createUser(app);
    await attachPlanToUser(userId, plan.id);

    // Start a session — this is the only allowed slot
    const { sessionId } = await startPlaybackSession(userId, "content-a", "MOVIE");

    // Force the session's lastHeartbeatAt far in the past (older than any timeout)
    await db.playbackSession.update({
      where: { id: sessionId },
      data: { lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000) }, // 10 minutes ago
    });

    // Starting a second session must now succeed because the stale first session got expired
    await expect(
      startPlaybackSession(userId, "content-b", "MOVIE"),
    ).resolves.toMatchObject({ sessionId: expect.any(String) });
  });
});

// ─────────────────────────────────────────────────────────────
describe("Ending a session frees the slot", () => {
  it("after ending the active session, a second stream is allowed", async () => {
    const plan = await createTestPlan({ maxConcurrentStreams: 1 });
    const { userId } = await createUser(app);
    await attachPlanToUser(userId, plan.id);

    // Start and then properly end a session
    const { sessionId } = await startPlaybackSession(userId, "content-a", "MOVIE");
    await endPlaybackSession(sessionId, userId);

    // Slot is now free — second session must succeed
    await expect(
      startPlaybackSession(userId, "content-b", "MOVIE"),
    ).resolves.toMatchObject({ sessionId: expect.any(String) });
  });
});
