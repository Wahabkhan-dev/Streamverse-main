/**
 * Phase 8 — Playback authorization tests covering movie, audiobook, and eBook.
 * Verifies signed URL issuance, storage key safety, and the entitlement service integration.
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
import { makePublishedMovie, makePublishedEbook, makePublishedAudiobook } from "../helpers/publishedContent";

const db = prisma as unknown as {
  __reset: () => void;
  movie: { update: (a: unknown) => Promise<unknown> };
  ebook: { update: (a: unknown) => Promise<unknown> };
  audiobook: { update: (a: unknown) => Promise<unknown> };
  mediaAsset: { create: (a: unknown) => Promise<{ id: string }> };
};
const app = createApp();
beforeEach(() => db.__reset());

async function authHeaders() {
  const { accessToken } = await createUser(app);
  return { Authorization: `Bearer ${accessToken}` };
}

async function readyAsset(type: string, contentId: string, extra: Record<string, unknown> = {}) {
  return db.mediaAsset.create({ data: { type, contentId, status: "READY", ...extra } });
}

describe("Movie playback — signed URL security", () => {
  it("eligible user gets a signed URL; response never contains storageKey", async () => {
    const { content } = await makePublishedMovie();
    const master = await readyAsset("MOVIE_MASTER", content.id, { hlsManifestKey: `hls/${content.id}/master.m3u8` });
    await db.movie.update({ where: { contentId: content.id }, data: { masterAssetId: master.id } });

    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
    expect(res.body.data.access.allowed).toBe(true);
    expect(res.body.data.mediaReady).toBe(true);
    expect(res.body.data.playback.url).toBeTruthy();
    expect(res.body.data.playback.expiresAt).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/i);
  });

  it("media not ready: canConsume=true but mediaReady=false, no URL", async () => {
    const { content } = await makePublishedMovie();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
    expect(res.body.data.mediaReady).toBe(false);
    expect(res.body.data.playback).toBeNull();
  });

  it("unknown content ID → 404", async () => {
    const res = await request(app).post(`/api/v1/media/movies/does-not-exist/playback`).set(await authHeaders());
    expect(res.status).toBe(404);
  });

  it("unauthenticated → 401", async () => {
    const { content } = await makePublishedMovie();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`);
    expect(res.status).toBe(401);
  });
});

describe("eBook access — signed URL security", () => {
  it("eligible user gets a signed URL for a READY epub", async () => {
    const { content } = await makePublishedEbook();
    const epub = await readyAsset("EBOOK_EPUB", content.id, { storageKey: `content/${content.id}/book.epub` });
    await db.ebook.update({ where: { contentId: content.id }, data: { epubAssetId: epub.id } });

    const res = await request(app).post(`/api/v1/media/ebooks/${content.id}/access`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
    expect(res.body.data.mediaReady).toBe(true);
    expect(res.body.data.access_url.url).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/i);
  });

  it("falls back to PDF when epub is not ready but PDF is", async () => {
    const { content } = await makePublishedEbook();
    const pdf = await readyAsset("EBOOK_PDF", content.id, { storageKey: `content/${content.id}/book.pdf` });
    await db.ebook.update({ where: { contentId: content.id }, data: { pdfAssetId: pdf.id } });

    const res = await request(app).post(`/api/v1/media/ebooks/${content.id}/access`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.mediaReady).toBe(true);
  });
});

describe("Audiobook playback", () => {
  it("single-file mode: eligible user gets a signed URL", async () => {
    const { content } = await makePublishedAudiobook();
    const main = await readyAsset("AUDIOBOOK_FILE", content.id, { storageKey: `content/${content.id}/audio.mp3` });
    await db.audiobook.update({ where: { contentId: content.id }, data: { mainAssetId: main.id, deliveryMode: "SINGLE_FILE" } });

    const res = await request(app).post(`/api/v1/media/audiobooks/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
    expect(res.body.data.playback).toMatchObject({ mode: "SINGLE_FILE" });
    expect(res.body.data.playback.url).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/i);
  });

  it("no ready assets: canConsume=true, mediaReady=false", async () => {
    const { content } = await makePublishedAudiobook();
    const res = await request(app).post(`/api/v1/media/audiobooks/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
    expect(res.body.data.mediaReady).toBe(false);
  });
});
