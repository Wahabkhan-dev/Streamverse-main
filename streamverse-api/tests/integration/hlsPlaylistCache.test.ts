import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});
vi.mock("../../src/services/stripe/stripe.service", () => import("../fakes/stripeService.fake.js"));

// Counting fake storage: the playlist FILES live here; every segment link it signs is unique.
const files = vi.hoisted(() => ({ reads: 0, signed: 0, objects: new Map<string, string>() }));
vi.mock("../../src/services/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/storage")>();
  const fake = {
    getObjectRange: async (key: string) => {
      files.reads++;
      const text = files.objects.get(key);
      if (text === undefined) throw new Error("no such object");
      return Buffer.from(text, "utf8");
    },
    createDownloadUrl: async (key: string) => `https://r2.example/${key}?sig=${++files.signed}`,
  };
  return { ...actual, getStorageProvider: () => ({ ...actual.getStorageProvider(), ...fake }) };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createUser } from "../helpers/adminAuth";
import { createTestPlan } from "../helpers/billing";
import * as fakeStripe from "../fakes/stripeService.fake";
import { applyStripeSubscriptionSnapshot } from "../../src/services/billing/subscription.service";
import { makePublishedMovie } from "../helpers/publishedContent";
import { updateMovie } from "../../src/services/movie.service";
import { updateMovieSchema } from "../../src/validators/movie.validator";
import { unpublishContent } from "../../src/services/contentStatus.service";
import { analyticsCache } from "../../src/utils/analyticsCache";

const db = prisma as unknown as { __reset: () => void; user: { update: (a: unknown) => Promise<unknown> }; mediaAsset: { create: (a: unknown) => Promise<{ id: string }> } };
const app = createApp();
const NO_ACTOR = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

const MASTER = ["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480", "480p/index.m3u8", "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080", "1080p/index.m3u8"].join("\n");
const VARIANT = (h: string) => ["#EXTM3U", "#EXT-X-TARGETDURATION:6", "#EXTINF:6.0,", `seg_${h}_0.ts`, "#EXT-X-ENDLIST"].join("\n");

beforeEach(() => {
  db.__reset();
  fakeStripe.__reset();
  analyticsCache.invalidate();
  files.reads = 0;
  files.signed = 0;
  files.objects.clear();
});

async function viewer(plan: Awaited<ReturnType<typeof createTestPlan>>) {
  const { accessToken, userId } = await createUser(app);
  const customer = fakeStripe.__createFakeCustomer(`${userId}@example.com`, userId);
  await db.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  await applyStripeSubscriptionSnapshot(fakeStripe.__createFakeSubscription({ customerId: customer.id, priceId: plan.stripePriceId, userId, planId: plan.id, status: "active" }) as never);
  return { Authorization: `Bearer ${accessToken}` };
}

async function readyMovie() {
  const { content } = await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" });
  const root = `media/hls/${content.id}`;
  files.objects.set(`${root}/master.m3u8`, MASTER);
  files.objects.set(`${root}/480p/index.m3u8`, VARIANT("480"));
  files.objects.set(`${root}/1080p/index.m3u8`, VARIANT("1080"));
  const asset = await db.mediaAsset.create({ data: { type: "MOVIE_MASTER", contentId: content.id, status: "READY", hlsManifestKey: `${root}/master.m3u8` } });
  await updateMovie(content.id, updateMovieSchema.parse({ movie: { masterAssetId: asset.id } }), NO_ACTOR);
  return content;
}

const playlistPath = async (contentId: string, headers: Record<string, string>) => {
  const play = await request(app).post(`/api/v1/media/movies/${contentId}/playback`).set(headers);
  expect(play.body.data.access.canConsume).toBe(true);
  return new URL(play.body.data.playback.url).pathname + new URL(play.body.data.playback.url).search;
};

describe("video playlist cache: only the file is cached, every request is still authorised", () => {
  it("reads each playlist file from storage once, but signs fresh segment links on every request", async () => {
    const movie = await readyMovie();
    const path = await playlistPath(movie.id, await viewer(await createTestPlan()));
    const variant = path.replace("master.m3u8", "1080p/index.m3u8");

    const first = await request(app).get(variant);
    const second = await request(app).get(variant);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(files.reads).toBe(1); // second request: file from the cache
    const segment = (text: string) => text.split("\n").find((l) => l.includes("seg_1080_0.ts"));
    expect(segment(first.text)).not.toBe(segment(second.text)); // links signed per request, never cached
    expect(first.headers["cache-control"]).toContain("no-store");
  });

  it("a title taken down stops streaming at once, even with its playlist cached and an unexpired token", async () => {
    const movie = await readyMovie();
    const path = await playlistPath(movie.id, await viewer(await createTestPlan()));
    expect((await request(app).get(path)).status).toBe(200);
    await unpublishContent("MOVIE", movie.id, NO_ACTOR);
    expect((await request(app).get(path)).status).toBe(404);
  });

  it("a token is still checked against the title, and a missing token is refused", async () => {
    const movie = await readyMovie();
    const other = await readyMovie();
    const path = await playlistPath(movie.id, await viewer(await createTestPlan()));
    expect((await request(app).get(path)).status).toBe(200);
    expect((await request(app).get(path.replace(movie.id, other.id))).status).toBe(401);
    expect((await request(app).get(path.split("?")[0]!)).status).toBe(401);
  });

  it("the plan's quality limit is applied per viewer: a 480p plan cannot get the 1080p variant someone else already cached", async () => {
    const movie = await readyMovie();
    const fullPath = await playlistPath(movie.id, await viewer(await createTestPlan()));
    expect((await request(app).get(fullPath.replace("master.m3u8", "1080p/index.m3u8"))).status).toBe(200); // now cached

    const capped = await playlistPath(movie.id, await viewer(await createTestPlan({ maxVideoQuality: "480p" })));
    const master = await request(app).get(capped);
    expect(master.status).toBe(200);
    expect(master.text).toContain("480p/index.m3u8");
    expect(master.text).not.toContain("1080p/index.m3u8");
    expect((await request(app).get(capped.replace("master.m3u8", "1080p/index.m3u8"))).status).toBe(403);
    expect((await request(app).get(capped.replace("master.m3u8", "480p/index.m3u8"))).status).toBe(200);
  });
});
