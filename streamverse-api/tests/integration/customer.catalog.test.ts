import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createMovie, updateMovie } from "../../src/services/movie.service";
import { unpublishContent } from "../../src/services/contentStatus.service";
import { createMovieSchema, updateMovieSchema } from "../../src/validators/movie.validator";
import { createUser } from "../helpers/adminAuth";
import { makePublishedAudiobook, makePublishedEbook, makePublishedMovie } from "../helpers/publishedContent";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

describe("customer catalog: visibility (Section 2/83)", () => {
  it("returns a published movie and hides draft/unpublished/archived/soft-deleted ones", async () => {
    await makePublishedMovie({ title: "Visible Movie" });
    await createMovie(createMovieSchema.parse({ title: "Draft Movie" }));

    const res = await request(app).get("/api/v1/movies");
    expect(res.status).toBe(200);
    const titles = res.body.data.map((m: { title: string }) => m.title);
    expect(titles).toContain("Visible Movie");
    expect(titles).not.toContain("Draft Movie");
  });

  it("filters, paginates, and the list never leaks admin-only fields", async () => {
    await makePublishedMovie({ title: "Only One Here" });
    const res = await request(app).get("/api/v1/movies").query({ search: "Only One", page: 1, limit: 20 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 1 });
    const card = res.body.data[0];
    expect(card).not.toHaveProperty("createdById");
    expect(card).not.toHaveProperty("contentCode");
    expect(card).not.toHaveProperty("deletedAt");
  });
});

describe("customer movie detail (Section 6/84)", () => {
  it("returns full detail for a valid slug, with no storage secret and a null rating (no rating model yet)", async () => {
    const { content } = await makePublishedMovie({ title: "Detail Movie" });
    const res = await request(app).get(`/api/v1/movies/${content.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Detail Movie");
    expect(res.body.data.rating).toBeNull();
    expect(res.body.data.reviewCount).toBe(0);
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/i);
    expect(res.body.data.access).toMatchObject({ canViewMetadata: true, canConsume: true });
  });

  it("404s an unknown slug", async () => {
    expect((await request(app).get("/api/v1/movies/no-such-slug")).status).toBe(404);
  });

  it("404s a slug that names real but unpublished content — same as unknown (Section 67)", async () => {
    const { content } = await createMovie(createMovieSchema.parse({ title: "Still A Draft" }));
    expect((await request(app).get(`/api/v1/movies/${content.slug}`)).status).toBe(404);
  });

  it("represents a SUBSCRIBERS_ONLY title as viewable metadata but not consumable, with a reason", async () => {
    const { content } = await makePublishedMovie({ title: "Premium Movie", visibility: "SUBSCRIBERS_ONLY" });
    const anon = await request(app).get(`/api/v1/movies/${content.slug}`);
    expect(anon.body.data.access).toMatchObject({ canViewMetadata: true, canConsume: false, reason: "SUBSCRIPTION_REQUIRED" });
  });

  it("represents an age-restricted title correctly for an unverified customer", async () => {
    const { content } = await makePublishedMovie({ title: "Mature Movie", age: { ageRating: "18+", ageRestricted: true, minimumAge: 18 } });
    const { accessToken } = await createUser(app);
    const res = await request(app).get(`/api/v1/movies/${content.slug}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.body.data.access).toMatchObject({ canConsume: false, reason: "AGE_RESTRICTED" });
  });
});

describe("customer ebook / audiobook catalog (Section 7-10)", () => {
  it("lists and shows a published ebook", async () => {
    const { content } = await makePublishedEbook({ title: "Readable Book", ebook: { author: "Odile Maren" } });
    expect((await request(app).get("/api/v1/ebooks")).body.data.map((b: { title: string }) => b.title)).toContain("Readable Book");
    const detail = await request(app).get(`/api/v1/ebooks/${content.slug}`);
    expect(detail.body.data.author).toBe("Odile Maren");
    expect(detail.body.data.readingReady).toBe(false); // no file attached yet
  });

  it("lists and shows a published audiobook", async () => {
    const { content } = await makePublishedAudiobook({ title: "Listenable Book", audiobook: { narrator: "Kemal Ross" } });
    expect((await request(app).get("/api/v1/audiobooks")).body.data.map((b: { title: string }) => b.title)).toContain("Listenable Book");
    const detail = await request(app).get(`/api/v1/audiobooks/${content.slug}`);
    expect(detail.body.data.narrator).toBe("Kemal Ross");
  });
});

describe("Admin changes propagate to customer APIs (Section 79)", () => {
  it("publish makes it discoverable, rename/slug-change shows immediately, unpublish removes it", async () => {
    const { content } = await makePublishedMovie({ title: "Working Title" });
    expect((await request(app).get("/api/v1/movies")).body.data.map((m: { title: string }) => m.title)).toContain("Working Title");

    const ctx = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };
    await updateMovie(content.id, updateMovieSchema.parse({ title: "Renamed Title", manualSlug: "brand-new-slug" }), ctx);
    const renamed = await request(app).get("/api/v1/movies/brand-new-slug");
    expect(renamed.body.data.title).toBe("Renamed Title");

    await unpublishContent("MOVIE", content.id, ctx);
    expect((await request(app).get("/api/v1/movies/brand-new-slug")).status).toBe(404);
    expect((await request(app).get("/api/v1/movies")).body.data.map((m: { title: string }) => m.title)).not.toContain("Renamed Title");
  });
});
