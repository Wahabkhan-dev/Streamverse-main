import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createUser } from "../helpers/adminAuth";
import { makePublishedAudiobook, makePublishedEbook, makePublishedMovie } from "../helpers/publishedContent";
import { updateMovie } from "../../src/services/movie.service";
import { updateMovieSchema } from "../../src/validators/movie.validator";
import { updateEbook } from "../../src/services/ebook.service";
import { updateEbookSchema } from "../../src/validators/ebook.validator";
import { updateAudiobook } from "../../src/services/audiobook.service";
import { updateAudiobookSchema } from "../../src/validators/audiobook.validator";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

async function auth() {
  const { accessToken } = await createUser(app);
  return { Authorization: `Bearer ${accessToken}` };
}

async function readyAsset(type: string, contentId: string, extra: Record<string, unknown> = {}) {
  return (prisma as unknown as { mediaAsset: { create: (a: unknown) => Promise<{ id: string }> } }).mediaAsset.create({ data: { type, contentId, status: "READY", ...extra } });
}

const NO_ACTOR = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

describe("Private movie playback (Section 53-56/101)", () => {
  it("blocks an unauthenticated request", async () => {
    const { content } = await makePublishedMovie();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`);
    expect(res.status).toBe(401);
  });

  it("an eligible user receives a short-lived signed URL, never a storage key", async () => {
    const { content } = await makePublishedMovie();
    const masterAsset = await readyAsset("MOVIE_MASTER", content.id, { hlsManifestKey: `content/${content.id}/hls/master.m3u8` });
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { masterAssetId: masterAsset.id } }), NO_ACTOR);

    const headers = await auth();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
    expect(res.body.data.mediaReady).toBe(true);
    expect(res.body.data.playback.url).toBeTruthy();
    expect(res.body.data.playback.expiresAt).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/i);
    expect(res.body.data.playback.url).not.toContain("hls/master.m3u8".split("/")[0]! + "//"); // sanity: not a raw bucket path
  });

  it("an ineligible (SUBSCRIBERS_ONLY, no subscription) user gets a reason, not a URL", async () => {
    const { content } = await makePublishedMovie({ visibility: "SUBSCRIBERS_ONLY" });
    const masterAsset = await readyAsset("MOVIE_MASTER", content.id, { hlsManifestKey: `content/${content.id}/hls/master.m3u8` });
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { masterAssetId: masterAsset.id } }), NO_ACTOR);

    const headers = await auth();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "SUBSCRIPTION_REQUIRED" });
    expect(res.body.data.playback).toBeNull();
  });

  it("an eligible user whose file hasn't finished processing gets mediaReady: false, no URL", async () => {
    const { content } = await makePublishedMovie();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await auth());
    expect(res.status).toBe(200);
    expect(res.body.data.mediaReady).toBe(false);
    expect(res.body.data.playback).toBeNull();
  });

  it("404s for content that doesn't exist for customers, the same as any other unknown id", async () => {
    const headers = await auth();
    const res = await request(app).post(`/api/v1/media/movies/not-a-real-id/playback`).set(headers);
    expect(res.status).toBe(404);
  });
});

describe("Private eBook/audiobook access", () => {
  it("eBook: returns a signed URL for whichever of EPUB/PDF is READY", async () => {
    const { content } = await makePublishedEbook();
    const epubAsset = await readyAsset("EBOOK_EPUB", content.id, { storageKey: `content/${content.id}/book.epub` });
    await updateEbook(content.id, updateEbookSchema.parse({ ebook: { epubAssetId: epubAsset.id } }), NO_ACTOR);

    const res = await request(app).post(`/api/v1/media/ebooks/${content.id}/access`).set(await auth());
    expect(res.status).toBe(200);
    expect(res.body.data.mediaReady).toBe(true);
    expect(res.body.data.signedUrl).toBeTruthy();
    expect(res.body.data.fileType).toBe("epub");
    expect(res.body.data.contentId).toBe(content.id);
    expect(res.body.data.expiresAt).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/i);
  });

  it("audiobook single-file: returns a signed URL when ready", async () => {
    const { content } = await makePublishedAudiobook();
    const mainAsset = await readyAsset("AUDIOBOOK_FILE", content.id, { storageKey: `content/${content.id}/audio.mp3` });
    await updateAudiobook(content.id, updateAudiobookSchema.parse({ audiobook: { mainAssetId: mainAsset.id } }), NO_ACTOR);

    const res = await request(app).post(`/api/v1/media/audiobooks/${content.id}/playback`).set(await auth());
    expect(res.status).toBe(200);
    expect(res.body.data.playback).toMatchObject({ mode: "SINGLE_FILE" });
    expect(res.body.data.playback.url).toBeTruthy();
  });
});
