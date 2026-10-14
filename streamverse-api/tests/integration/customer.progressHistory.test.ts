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

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

async function auth() {
  const { accessToken } = await createUser(app);
  return { Authorization: `Bearer ${accessToken}` };
}

describe("Movie progress (Section 34/35)", () => {
  it("creates then updates progress, deriving percentage server-side", async () => {
    const headers = await auth();
    const { content } = await makePublishedMovie({ title: "Progress Movie" });

    const first = await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(headers).send({ positionSeconds: 30, durationSeconds: 120 });
    expect(first.status).toBe(200);
    expect(first.body.data.percentage).toBeCloseTo(25, 0);
    expect(first.body.data.completed).toBe(false);

    const second = await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(headers).send({ positionSeconds: 118, durationSeconds: 120 });
    expect(second.body.data.percentage).toBeGreaterThanOrEqual(95);
    expect(second.body.data.completed).toBe(true);

    const got = await request(app).get(`/api/v1/me/progress/movie/${content.id}`).set(headers);
    expect(got.body.data.positionSeconds).toBe(118);
  });

  it("rejects a negative position", async () => {
    const headers = await auth();
    const { content } = await makePublishedMovie();
    const res = await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(headers).send({ positionSeconds: -5 });
    expect(res.status).toBe(400);
  });

  it("is isolated per user", async () => {
    const headersA = await auth();
    const headersB = await auth();
    const { content } = await makePublishedMovie();
    await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(headersA).send({ positionSeconds: 50, durationSeconds: 100 });

    const bView = await request(app).get(`/api/v1/me/progress/movie/${content.id}`).set(headersB);
    expect(bView.body.data).toBeNull();
  });
});

describe("eBook progress (Section 36/37)", () => {
  it("saves a client-supplied percentage (page-based)", async () => {
    const headers = await auth();
    const { content } = await makePublishedEbook({ title: "Progress Book" });
    const res = await request(app).put(`/api/v1/me/progress/ebook/${content.id}`).set(headers).send({ page: 42, percentage: 60 });
    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(42);
    expect(res.body.data.percentage).toBe(60);
  });

  it("requires at least a location or a page", async () => {
    const headers = await auth();
    const { content } = await makePublishedEbook();
    const res = await request(app).put(`/api/v1/me/progress/ebook/${content.id}`).set(headers).send({ percentage: 10 });
    expect(res.status).toBe(400);
  });
});

describe("Audiobook progress (Section 38)", () => {
  it("rejects a chapterId that does not belong to the audiobook", async () => {
    const headers = await auth();
    const { content } = await makePublishedAudiobook({ title: "Progress Audiobook" });
    const res = await request(app).put(`/api/v1/me/progress/audiobook/${content.id}`).set(headers).send({ positionSeconds: 10, chapterId: "not-a-real-chapter" });
    expect(res.status).toBe(404);
  });

  it("saves position without a chapter", async () => {
    const headers = await auth();
    const { content } = await makePublishedAudiobook();
    const res = await request(app).put(`/api/v1/me/progress/audiobook/${content.id}`).set(headers).send({ positionSeconds: 98, durationSeconds: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.completed).toBe(true);
  });
});

describe("History (Section 44/45)", () => {
  it("a progress update touches history, and it appears in the list", async () => {
    const headers = await auth();
    const { content } = await makePublishedMovie({ title: "Watched Movie" });
    await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(headers).send({ positionSeconds: 10, durationSeconds: 100 });

    const history = await request(app).get("/api/v1/me/history").set(headers);
    expect(history.status).toBe(200);
    expect(history.body.data[0]).toMatchObject({ title: "Watched Movie", activityType: "WATCHED" });
  });

  it("removing from history keeps the underlying progress intact", async () => {
    const headers = await auth();
    const { content } = await makePublishedMovie();
    await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(headers).send({ positionSeconds: 10, durationSeconds: 100 });

    await request(app).delete(`/api/v1/me/history/${content.id}`).set(headers);
    expect((await request(app).get("/api/v1/me/history").set(headers)).body.data).toHaveLength(0);

    const progress = await request(app).get(`/api/v1/me/progress/movie/${content.id}`).set(headers);
    expect(progress.body.data.positionSeconds).toBe(10);
  });

  it("re-accessing clears the removed flag again", async () => {
    const headers = await auth();
    const { content } = await makePublishedMovie();
    await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(headers).send({ positionSeconds: 10, durationSeconds: 100 });
    await request(app).delete(`/api/v1/me/history/${content.id}`).set(headers);

    await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(headers).send({ positionSeconds: 20, durationSeconds: 100 });
    expect((await request(app).get("/api/v1/me/history").set(headers)).body.data).toHaveLength(1);
  });
});
