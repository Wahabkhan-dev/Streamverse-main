import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { updateMovie } from "../../src/services/movie.service";
import { updateMovieSchema } from "../../src/validators/movie.validator";
import { createUser } from "../helpers/adminAuth";
import { makePublishedMovie } from "../helpers/publishedContent";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

async function auth() {
  const { accessToken } = await createUser(app);
  return { Authorization: `Bearer ${accessToken}` };
}

describe.each([
  { name: "My List", base: "/api/v1/me/my-list" },
  { name: "Library", base: "/api/v1/me/library" },
])("$name (Section 27-31)", ({ base }) => {
  it("requires auth", async () => {
    expect((await request(app).get(base)).status).toBe(401);
  });

  it("adds, lists, and is idempotent on a duplicate add", async () => {
    const headers = await auth();
    const { content } = await makePublishedMovie({ title: "Listed Movie" });

    const add1 = await request(app).post(`${base}/${content.id}`).set(headers);
    expect(add1.status).toBe(201);
    const add2 = await request(app).post(`${base}/${content.id}`).set(headers);
    expect(add2.status).toBe(201); // upsert: adding twice doesn't error or duplicate

    const list = await request(app).get(base).set(headers);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].title).toBe("Listed Movie");
  });

  it("404s adding content that isn't customer-visible", async () => {
    const headers = await auth();
    const res = await request(app).post(`${base}/not-a-real-id`).set(headers);
    expect(res.status).toBe(404);
  });

  it("removes an item, and removing an absent one is a safe no-op", async () => {
    const headers = await auth();
    const { content } = await makePublishedMovie({ title: "Removable Movie" });
    await request(app).post(`${base}/${content.id}`).set(headers);

    const remove1 = await request(app).delete(`${base}/${content.id}`).set(headers);
    expect(remove1.status).toBe(200);
    const remove2 = await request(app).delete(`${base}/${content.id}`).set(headers);
    expect(remove2.status).toBe(200);

    expect((await request(app).get(base).set(headers)).body.data).toHaveLength(0);
  });

  it("is isolated per user", async () => {
    const headersA = await auth();
    const headersB = await auth();
    const { content } = await makePublishedMovie({ title: "Shared Content" });
    await request(app).post(`${base}/${content.id}`).set(headersA);

    expect((await request(app).get(base).set(headersA)).body.data).toHaveLength(1);
    expect((await request(app).get(base).set(headersB)).body.data).toHaveLength(0);
  });

  it("reflects a renamed title without needing to re-add", async () => {
    const headers = await auth();
    const { content } = await makePublishedMovie({ title: "Old Title" });
    await request(app).post(`${base}/${content.id}`).set(headers);

    await updateMovie(content.id, updateMovieSchema.parse({ title: "New Title" }), { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined });

    const list = await request(app).get(base).set(headers);
    expect(list.body.data[0].title).toBe("New Title");
  });

  it("silently hides a saved item that is no longer customer-visible, rather than erroring", async () => {
    const headers = await auth();
    const { content } = await makePublishedMovie({ title: "Soon Hidden" });
    await request(app).post(`${base}/${content.id}`).set(headers);

    await (prisma as unknown as { content: { update: (a: unknown) => Promise<unknown> } }).content.update({ where: { id: content.id }, data: { status: "UNPUBLISHED" } });

    const list = await request(app).get(base).set(headers);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);
  });
});
