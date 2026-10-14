import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import { getUserGrowth } from "../../src/services/analytics/userAnalytics.service";
import { resolveRange } from "../../src/utils/dateRange";

const db = prisma as unknown as {
  __reset: () => void;
  user: { create: (a: unknown) => Promise<{ id: string }> };
  movieProgress: { create: (a: unknown) => Promise<unknown> };
  movie: { create: (a: unknown) => Promise<unknown> };
  content: { create: (a: unknown) => Promise<{ id: string }> };
};

beforeEach(() => db.__reset());

async function createUser(email: string, daysAgo: number) {
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - daysAgo);
  return db.user.create({
    data: { email, passwordHash: "x", fullName: "Test", createdAt },
  });
}

describe("user growth analytics", () => {
  it("counts exact new users in range", async () => {
    // 3 users created 5 days ago (within 30d range)
    await createUser("u1@x.com", 5);
    await createUser("u2@x.com", 5);
    await createUser("u3@x.com", 5);
    // 1 user created 40 days ago (outside 30d range)
    await createUser("old@x.com", 40);

    const range = resolveRange("30d");
    const result = await getUserGrowth(range, "day");

    expect(result.totalNewUsers).toBe(3);
  });

  it("cumulative users includes all users up to each date", async () => {
    // Create 1 user far in the past
    const pastUser = new Date();
    pastUser.setDate(pastUser.getDate() - 60);
    await db.user.create({ data: { email: "past@x.com", passwordHash: "x", fullName: "Past", createdAt: pastUser } });

    // Create 2 users in range
    await createUser("a@x.com", 5);
    await createUser("b@x.com", 3);

    const range = resolveRange("30d");
    const result = await getUserGrowth(range, "day");

    // cumulative at end should be 3 (1 past + 2 in range)
    const last = result.timeSeries[result.timeSeries.length - 1]!;
    expect(last.cumulativeUsers).toBe(3);
  });

  it("time series has daily buckets covering the range", async () => {
    const range = resolveRange("7d");
    const result = await getUserGrowth(range, "day");
    // 7 days = 8 buckets (inclusive)
    expect(result.timeSeries.length).toBe(8);
  });

  it("weekly groupBy produces fewer buckets than daily", async () => {
    const range = resolveRange("30d");
    const daily = await getUserGrowth(range, "day");
    const weekly = await getUserGrowth(range, "week");
    expect(weekly.timeSeries.length).toBeLessThan(daily.timeSeries.length);
  });

  it("active users counts distinct users with any progress in period", async () => {
    const user1 = await createUser("active1@x.com", 5);
    // Create content for the movie progress
    const content = await db.content.create({ data: { type: "MOVIE", title: "T", slug: "t", contentCode: "M-001", status: "PUBLISHED" } });
    await db.movie.create({ data: { contentId: content.id } });

    const updatedAt = new Date();
    updatedAt.setDate(updatedAt.getDate() - 2); // within 30d
    await db.movieProgress.create({ data: { userId: user1.id, movieId: content.id, percentage: 50, completed: false, updatedAt } });

    const range = resolveRange("30d");
    const result = await getUserGrowth(range, "day");
    expect(result.activeUsers).toBe(1);
  });

  it("newUsers = 0 when no users created in range", async () => {
    // Only old user
    await createUser("old@x.com", 40);
    const range = resolveRange("7d");
    const result = await getUserGrowth(range, "day");
    expect(result.totalNewUsers).toBe(0);
  });
});
