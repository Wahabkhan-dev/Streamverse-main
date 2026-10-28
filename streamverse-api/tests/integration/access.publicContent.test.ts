/**
 * Phase 8 — Public content access tests.
 * Verifies the customer visibility rules: PUBLISHED + not deleted + not HIDDEN + in availability window.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { makePublishedMovie, makePublishedEbook, makePublishedAudiobook } from "../helpers/publishedContent";

const db = prisma as unknown as {
  __reset: () => void;
  content: { update: (a: unknown) => Promise<unknown> };
};
const app = createApp();
beforeEach(() => db.__reset());

async function authHeaders() {
  const { accessToken } = await createUser(app);
  return { Authorization: `Bearer ${accessToken}` };
}

async function readyAsset(type: string, contentId: string, extra: Record<string, unknown> = {}) {
  return (prisma as unknown as { mediaAsset: { create: (a: unknown) => Promise<{ id: string }> } }).mediaAsset.create({
    data: { type, contentId, status: "READY", ...extra },
  });
}

describe("PUBLISHED + PUBLIC content is accessible to any authenticated user", () => {
  it("allows movie playback for a PUBLISHED PUBLIC movie with a ready master asset", async () => {
    const { content } = await makePublishedMovie();
    const master = await readyAsset("MOVIE_MASTER", content.id, { hlsManifestKey: `hls/${content.id}/master.m3u8` });
    await (prisma as unknown as { movie: { update: (a: unknown) => Promise<unknown> } }).movie.update({
      where: { contentId: content.id },
      data: { masterAssetId: master.id },
    });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
    expect(res.body.data.access.allowed).toBe(true);
  });

  it("returns mediaReady=false but access granted when master asset not yet ready", async () => {
    const { content } = await makePublishedMovie();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.access.canConsume).toBe(true);
    expect(res.body.data.mediaReady).toBe(false);
    expect(res.body.data.playback).toBeNull();
  });
});

describe("DRAFT / UNPUBLISHED / ARCHIVED content is not customer-visible", () => {
  it("404s for DRAFT content", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { status: "DRAFT" } });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(404);
  });

  it("404s for ARCHIVED content", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { status: "ARCHIVED" } });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(404);
  });

  it("404s for UNPUBLISHED content", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { status: "UNPUBLISHED" } });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(404);
  });
});

describe("an admin's Preview opens the detail page of a title that is not live", () => {
  const user = { findUnique: (a: unknown) => (prisma as unknown as { user: { findUnique: (a: unknown) => Promise<{ id: string } | null> } }).user.findUnique(a), update: (a: unknown) => (prisma as unknown as { user: { update: (a: unknown) => Promise<unknown> } }).user.update(a) };

  it("a draft movie: 200 with previewStatus for an admin, still 404 for a customer and for nobody signed in", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { status: "DRAFT" } });
    const { accessToken } = await createAdmin(app, { user });
    const admin = await request(app).get(`/api/v1/movies/${content.slug}`).set({ Authorization: `Bearer ${accessToken}` });
    expect(admin.status).toBe(200);
    expect(admin.body.data.previewStatus).toBe("DRAFT");
    expect((await request(app).get(`/api/v1/movies/${content.slug}`).set(await authHeaders())).status).toBe(404);
    expect((await request(app).get(`/api/v1/movies/${content.slug}`)).status).toBe(404);
  });

  it("a live title carries no previewStatus, and a deleted one stays 404 even for an admin", async () => {
    const { content } = await makePublishedEbook();
    const { accessToken } = await createAdmin(app, { user });
    const live = await request(app).get(`/api/v1/ebooks/${content.slug}`).set({ Authorization: `Bearer ${accessToken}` });
    expect(live.status).toBe(200);
    expect(live.body.data.previewStatus).toBeUndefined();
    await db.content.update({ where: { id: content.id }, data: { deletedAt: new Date() } });
    expect((await request(app).get(`/api/v1/ebooks/${content.slug}`).set({ Authorization: `Bearer ${accessToken}` })).status).toBe(404);
  });
});

describe("You May Also Like", () => {
  it("offers the other titles of the same type even when nothing is shared, never the title itself or another type", async () => {
    const books = [];
    for (const title of ["Book One", "Book Two", "Book Three", "Book Four"]) books.push((await makePublishedAudiobook({ title })).content);
    await makePublishedMovie({ title: "A Movie" });
    await makePublishedEbook({ title: "An eBook" });
    const hidden = (await makePublishedAudiobook({ title: "Not Live" })).content;
    await db.content.update({ where: { id: hidden.id }, data: { status: "DRAFT" } });

    const res = await request(app).get(`/api/v1/audiobooks/${books[0]!.slug}`);
    expect(res.status).toBe(200);
    const related = res.body.data.related as { slug: string; type: string }[];
    expect(related.map((r) => r.slug).sort()).toEqual(books.slice(1).map((b) => b.slug).sort());
    expect(related.every((r) => r.type === "AUDIOBOOK")).toBe(true);
  });
});

describe("HIDDEN content is not customer-visible (existence not confirmed)", () => {
  it("404s for a HIDDEN movie even if PUBLISHED", async () => {
    const { content } = await makePublishedMovie({ visibility: "HIDDEN" });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(404);
  });

  it("HIDDEN ebook also 404s", async () => {
    const { content } = await makePublishedEbook({ visibility: "HIDDEN" });
    const res = await request(app).post(`/api/v1/media/ebooks/${content.id}/access`).set(await authHeaders());
    expect(res.status).toBe(404);
  });
});

describe("Soft-deleted content is not customer-visible", () => {
  it("404s for a soft-deleted movie", async () => {
    const { content } = await makePublishedMovie();
    await db.content.update({ where: { id: content.id }, data: { deletedAt: new Date() } });
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`).set(await authHeaders());
    expect(res.status).toBe(404);
  });
});

describe("Unauthenticated requests to playback endpoints", () => {
  it("401s without a token", async () => {
    const { content } = await makePublishedMovie();
    const res = await request(app).post(`/api/v1/media/movies/${content.id}/playback`);
    expect(res.status).toBe(401);
  });

  it("eBook 401 without a token", async () => {
    const { content } = await makePublishedEbook();
    const res = await request(app).post(`/api/v1/media/ebooks/${content.id}/access`);
    expect(res.status).toBe(401);
  });

  it("audiobook 401 without a token", async () => {
    const { content } = await makePublishedAudiobook();
    const res = await request(app).post(`/api/v1/media/audiobooks/${content.id}/playback`);
    expect(res.status).toBe(401);
  });
});
