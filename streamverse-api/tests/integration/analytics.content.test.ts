import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import { getMovieAnalytics } from "../../src/services/analytics/contentAnalytics.service";
import { getEbookAnalytics } from "../../src/services/analytics/contentAnalytics.service";
import { getAudiobookAnalytics } from "../../src/services/analytics/contentAnalytics.service";
import { getTopContent } from "../../src/services/analytics/contentAnalytics.service";
import { resolveRange } from "../../src/utils/dateRange";

const db = prisma as unknown as {
  __reset: () => void;
  user: { create: (a: unknown) => Promise<{ id: string }> };
  content: { create: (a: unknown) => Promise<{ id: string }> };
  movie: { create: (a: unknown) => Promise<unknown> };
  ebook: { create: (a: unknown) => Promise<unknown> };
  audiobook: { create: (a: unknown) => Promise<unknown> };
  movieProgress: { create: (a: unknown) => Promise<unknown> };
  ebookProgress: { create: (a: unknown) => Promise<unknown> };
  audiobookProgress: { create: (a: unknown) => Promise<unknown> };
};

beforeEach(() => db.__reset());

async function createMovieContent(title: string, code: string) {
  const content = await db.content.create({ data: { type: "MOVIE", title, slug: title.toLowerCase().replace(/ /g, "-"), contentCode: code, status: "PUBLISHED" } });
  await db.movie.create({ data: { contentId: content.id } });
  return content;
}

async function createUser(email: string) {
  return db.user.create({ data: { email, passwordHash: "x", fullName: "Test" } });
}

describe("movie analytics", () => {
  it("counts starts, completions, uniqueViewers, completionRate", async () => {
    const user1 = await createUser("u1@x.com");
    const user2 = await createUser("u2@x.com");
    const movie1 = await createMovieContent("Movie 1", "M-001");

    const now = new Date();
    now.setDate(now.getDate() - 2);
    await db.movieProgress.create({ data: { userId: user1.id, movieId: movie1.id, percentage: 50, completed: false, updatedAt: now } });
    await db.movieProgress.create({ data: { userId: user2.id, movieId: movie1.id, percentage: 100, completed: true, updatedAt: now } });

    const range = resolveRange("30d");
    const result = await getMovieAnalytics(range);

    expect(result.totalStarts).toBe(2);
    expect(result.completions).toBe(1);
    expect(result.uniqueViewers).toBe(2);
    expect(result.completionRate).toBe(0.5);
  });

  it("completionRate = 0 when no starts", async () => {
    const range = resolveRange("7d");
    const result = await getMovieAnalytics(range);
    expect(result.completionRate).toBe(0);
  });

  it("topMovies lists up to 10, sorted by starts desc", async () => {
    const user = await createUser("u@x.com");
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const m = await createMovieContent(`Movie ${i}`, `M-${i.toString().padStart(3, "0")}`);
      await db.movieProgress.create({ data: { userId: user.id, movieId: m.id, percentage: 50, completed: false, updatedAt: now } });
    }

    const range = resolveRange("30d");
    const result = await getMovieAnalytics(range);
    expect(result.topMovies.length).toBeLessThanOrEqual(10);
  });
});

describe("ebook analytics", () => {
  it("counts starts, completions, averageProgress", async () => {
    const user = await createUser("u@x.com");
    const content = await db.content.create({ data: { type: "EBOOK", title: "Book", slug: "book", contentCode: "E-001", status: "PUBLISHED" } });
    await db.ebook.create({ data: { contentId: content.id } });

    const now = new Date();
    await db.ebookProgress.create({ data: { userId: user.id, ebookId: content.id, percentage: 60, completed: false, updatedAt: now } });

    const range = resolveRange("30d");
    const result = await getEbookAnalytics(range);
    expect(result.totalStarts).toBe(1);
    expect(result.averageProgress).toBe(60);
  });
});

describe("audiobook analytics", () => {
  it("counts starts, uniqueListeners", async () => {
    const u1 = await createUser("u1@x.com");
    const u2 = await createUser("u2@x.com");
    const content = await db.content.create({ data: { type: "AUDIOBOOK", title: "AB", slug: "ab", contentCode: "A-001", status: "PUBLISHED" } });
    await db.audiobook.create({ data: { contentId: content.id } });

    const now = new Date();
    await db.audiobookProgress.create({ data: { userId: u1.id, audiobookId: content.id, percentage: 30, completed: false, updatedAt: now } });
    await db.audiobookProgress.create({ data: { userId: u2.id, audiobookId: content.id, percentage: 80, completed: false, updatedAt: now } });

    const range = resolveRange("30d");
    const result = await getAudiobookAnalytics(range);
    expect(result.totalStarts).toBe(2);
    expect(result.uniqueListeners).toBe(2);
  });
});

describe("top content", () => {
  it("returns top N items sorted by starts desc", async () => {
    const user = await createUser("u@x.com");
    const now = new Date();
    const movieA = await createMovieContent("Popular Movie", "M-POP");
    const movieB = await createMovieContent("Less Popular", "M-LES");

    // 3 starts for A, 1 for B
    for (let i = 0; i < 3; i++) {
      const u = await createUser(`u${i}@x.com`);
      await db.movieProgress.create({ data: { userId: u.id, movieId: movieA.id, percentage: 50, completed: false, updatedAt: now } });
    }
    await db.movieProgress.create({ data: { userId: user.id, movieId: movieB.id, percentage: 20, completed: false, updatedAt: now } });

    const range = resolveRange("30d");
    const result = await getTopContent(range, "Movie", "starts", 10);
    expect(result[0]!.contentId).toBe(movieA.id);
    expect(result[0]!.count).toBe(3);
    expect(result[1]!.count).toBe(1);
  });

  it("filters by content type", async () => {
    const user = await createUser("u@x.com");
    const now = new Date();
    const movie = await createMovieContent("A Movie", "M-A1");
    await db.movieProgress.create({ data: { userId: user.id, movieId: movie.id, percentage: 50, completed: false, updatedAt: now } });

    const range = resolveRange("30d");
    const movies = await getTopContent(range, "Movie", "starts", 10);
    const ebooks = await getTopContent(range, "eBook", "starts", 10);
    expect(movies.length).toBeGreaterThan(0);
    expect(ebooks.length).toBe(0);
  });
});
