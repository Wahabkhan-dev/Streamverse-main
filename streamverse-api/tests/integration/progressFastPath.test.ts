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

type Rows = { findMany: (a: { where: Record<string, unknown> }) => Promise<Record<string, unknown>[]> };
const db = prisma as unknown as { __reset: () => void; movieProgress: Rows; ebookProgress: Rows; audiobookProgress: Rows; userHistory: Rows; content: { update: (a: unknown) => Promise<unknown> } };
const app = createApp();
beforeEach(() => db.__reset());

/** The single-statement progress/history writes (repositories) must save exactly what the old upserts saved. */
describe("progress saves (one UPDATE per save)", () => {
  it("repeated saves keep ONE progress row and ONE history row, with the latest values, and return what was stored", async () => {
    const { content } = await makePublishedMovie({ title: "Long Movie" });
    const { accessToken, userId } = await createUser(app);
    const auth = { Authorization: `Bearer ${accessToken}` };
    let last;
    for (const pos of [30, 60, 90]) last = await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(auth).send({ positionSeconds: pos, durationSeconds: 600 });
    expect(last!.status).toBe(200);
    expect(last!.body.data).toMatchObject({ positionSeconds: 90, durationSeconds: 600, percentage: 15, completed: false });

    const rows = await db.movieProgress.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ positionSeconds: 90, durationSeconds: 600, percentage: 15, completed: false });
    expect(new Date(last!.body.data.updatedAt).getTime()).toBe((rows[0]!.updatedAt as Date).getTime()); // the returned row is the stored row
    expect(await db.userHistory.findMany({ where: { userId } })).toHaveLength(1);

    // a later save without durationSeconds keeps the stored one (same as before)
    const noDuration = await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(auth).send({ positionSeconds: 594 });
    expect(noDuration.body.data).toMatchObject({ positionSeconds: 594, durationSeconds: 600, percentage: 99, completed: true });

    const got = await request(app).get(`/api/v1/me/progress/movie/${content.id}`).set(auth);
    expect(got.body.data).toMatchObject({ positionSeconds: 594, completed: true });
  });

  it("a title removed from history comes back on the next save (history touch still un-removes)", async () => {
    const { content } = await makePublishedMovie({ title: "Back Again" });
    const { accessToken, userId } = await createUser(app);
    const auth = { Authorization: `Bearer ${accessToken}` };
    await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(auth).send({ positionSeconds: 30, durationSeconds: 600 });
    await request(app).delete(`/api/v1/me/history/${content.id}`).set(auth);
    expect((await db.userHistory.findMany({ where: { userId } }))[0]!.removedAt).not.toBeNull();
    await request(app).put(`/api/v1/me/progress/movie/${content.id}`).set(auth).send({ positionSeconds: 40, durationSeconds: 600 });
    const history = await db.userHistory.findMany({ where: { userId } });
    expect(history).toHaveLength(1);
    expect(history[0]!.removedAt).toBeNull();
  });

  it("ebook and audiobook saves: unchanged fields stay, the chapter must belong to the book, a deleted title is refused", async () => {
    const { content: book } = await makePublishedEbook({ title: "Book" });
    const { content: audio } = await makePublishedAudiobook({ title: "Audio" });
    const { accessToken, userId } = await createUser(app);
    const auth = { Authorization: `Bearer ${accessToken}` };

    await request(app).put(`/api/v1/me/progress/ebook/${book.id}`).set(auth).send({ location: "epubcfi(/6/2)", page: 3, percentage: 10 });
    const second = await request(app).put(`/api/v1/me/progress/ebook/${book.id}`).set(auth).send({ page: 4, percentage: 20 });
    expect(second.body.data).toMatchObject({ location: "epubcfi(/6/2)", page: 4, percentage: 20 }); // location not sent → left as it was
    expect((await db.ebookProgress.findMany({ where: { userId } }))[0]).toMatchObject({ location: "epubcfi(/6/2)", page: 4, percentage: 20 });

    await request(app).put(`/api/v1/me/progress/audiobook/${audio.id}`).set(auth).send({ positionSeconds: 10, durationSeconds: 100 });
    const again = await request(app).put(`/api/v1/me/progress/audiobook/${audio.id}`).set(auth).send({ positionSeconds: 50, durationSeconds: 100 });
    expect(again.body.data).toMatchObject({ positionSeconds: 50, percentage: 50 });
    expect(await db.audiobookProgress.findMany({ where: { userId } })).toHaveLength(1);
    const wrongChapter = await request(app).put(`/api/v1/me/progress/audiobook/${audio.id}`).set(auth).send({ positionSeconds: 60, chapterId: "not-a-chapter-of-this-book" });
    expect(wrongChapter.status).toBe(404);

    await db.content.update({ where: { id: audio.id }, data: { deletedAt: new Date() } });
    const gone = await request(app).put(`/api/v1/me/progress/audiobook/${audio.id}`).set(auth).send({ positionSeconds: 70, durationSeconds: 100 });
    expect(gone.status).toBe(404);
  });
});
