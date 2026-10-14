import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createUser } from "../helpers/adminAuth";
import { makePublishedEbook } from "../helpers/publishedContent";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

async function auth() {
  const { accessToken } = await createUser(app);
  return { Authorization: `Bearer ${accessToken}` };
}

async function userIdFor(headers: Record<string, string>) {
  const res = await request(app).get("/api/v1/me/profile").set(headers);
  return res.body.data.id as string;
}

describe("eBook bookmarks (Section 47)", () => {
  it("creates and lists bookmarks for an ebook", async () => {
    const headers = await auth();
    const { content } = await makePublishedEbook({ title: "Bookmarked Book" });

    const create = await request(app).post(`/api/v1/me/ebooks/${content.id}/bookmarks`).set(headers).send({ location: "chapter-3", label: "Cliffhanger" });
    expect(create.status).toBe(201);

    const list = await request(app).get(`/api/v1/me/ebooks/${content.id}/bookmarks`).set(headers);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ location: "chapter-3", label: "Cliffhanger" });
  });

  it("allows multiple bookmarks for the same ebook", async () => {
    const headers = await auth();
    const { content } = await makePublishedEbook();
    await request(app).post(`/api/v1/me/ebooks/${content.id}/bookmarks`).set(headers).send({ location: "loc-1" });
    await request(app).post(`/api/v1/me/ebooks/${content.id}/bookmarks`).set(headers).send({ location: "loc-2" });
    const list = await request(app).get(`/api/v1/me/ebooks/${content.id}/bookmarks`).set(headers);
    expect(list.body.data).toHaveLength(2);
  });

  it("404s for an unknown ebook", async () => {
    const headers = await auth();
    const res = await request(app).post(`/api/v1/me/ebooks/not-a-real-id/bookmarks`).set(headers).send({ location: "loc-1" });
    expect(res.status).toBe(404);
  });

  it("deletes a bookmark, and blocks deleting someone else's with a 404 (not 403)", async () => {
    const headersA = await auth();
    const headersB = await auth();
    const { content } = await makePublishedEbook();
    const create = await request(app).post(`/api/v1/me/ebooks/${content.id}/bookmarks`).set(headersA).send({ location: "loc-1" });
    const bookmarkId = create.body.data.id;

    const blocked = await request(app).delete(`/api/v1/me/ebooks/${content.id}/bookmarks/${bookmarkId}`).set(headersB);
    expect(blocked.status).toBe(404);

    const ok = await request(app).delete(`/api/v1/me/ebooks/${content.id}/bookmarks/${bookmarkId}`).set(headersA);
    expect(ok.status).toBe(200);
  });
});

describe("Notifications (Section 50/51)", () => {
  it("lists, reports unread count, and marking read updates both", async () => {
    const headers = await auth();
    const userId = await userIdFor(headers);
    await (prisma as unknown as { notification: { create: (a: unknown) => Promise<{ id: string }> } }).notification.create({ data: { userId, type: "SYSTEM", title: "Welcome", message: "Hi there" } });
    const n2 = await (prisma as unknown as { notification: { create: (a: unknown) => Promise<{ id: string }> } }).notification.create({ data: { userId, type: "SYSTEM", title: "Second", message: "Another" } });

    const list = await request(app).get("/api/v1/me/notifications").set(headers);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.unreadCount).toBe(2);

    await request(app).post(`/api/v1/me/notifications/${n2.id}/read`).set(headers);
    const after = await request(app).get("/api/v1/me/notifications").set(headers);
    expect(after.body.unreadCount).toBe(1);
  });

  it("markAllRead zeroes the unread count", async () => {
    const headers = await auth();
    const userId = await userIdFor(headers);
    await (prisma as unknown as { notification: { create: (a: unknown) => Promise<unknown> } }).notification.create({ data: { userId, type: "SYSTEM", title: "A", message: "a" } });
    await (prisma as unknown as { notification: { create: (a: unknown) => Promise<unknown> } }).notification.create({ data: { userId, type: "SYSTEM", title: "B", message: "b" } });

    await request(app).post("/api/v1/me/notifications/read-all").set(headers);
    const after = await request(app).get("/api/v1/me/notifications").set(headers);
    expect(after.body.unreadCount).toBe(0);
  });

  it("deletes a notification, and blocks cross-user access with a 404", async () => {
    const headersA = await auth();
    const headersB = await auth();
    const userIdA = await userIdFor(headersA);
    const created = await (prisma as unknown as { notification: { create: (a: unknown) => Promise<{ id: string }> } }).notification.create({ data: { userId: userIdA, type: "SYSTEM", title: "Mine", message: "mine" } });

    const blockedRead = await request(app).post(`/api/v1/me/notifications/${created.id}/read`).set(headersB);
    expect(blockedRead.status).toBe(404);
    const blockedDelete = await request(app).delete(`/api/v1/me/notifications/${created.id}`).set(headersB);
    expect(blockedDelete.status).toBe(404);

    const ok = await request(app).delete(`/api/v1/me/notifications/${created.id}`).set(headersA);
    expect(ok.status).toBe(200);
    expect((await request(app).get("/api/v1/me/notifications").set(headersA)).body.data).toHaveLength(0);
  });
});
