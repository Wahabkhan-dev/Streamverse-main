import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { makeDraftEbook, makeDraftMovie } from "../helpers/draftContent";

const db = prisma as unknown as { __reset: () => void; mediaAsset: { findUnique: (a: unknown) => Promise<{ status: string } | null> } };
const app = createApp();

beforeEach(() => db.__reset());

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

async function presignPoster(headers: Record<string, string>, contentId: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post("/api/v1/admin/uploads/presign")
    .set(headers)
    .send({ contentId, purpose: "POSTER", fileName: "poster.jpg", mimeType: "image/jpeg", sizeBytes: 50_000, ...overrides });
}

async function uploadBytes(uploadUrl: string, bytes: Buffer, contentType: string) {
  return request(app).put(uploadUrl).set("Content-Type", contentType).send(bytes);
}

// A minimal, real JPEG: SOI, APP0 JFIF, then an SOF0 segment declaring 600x900, then EOI.
function fakeJpeg(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof0 = Buffer.alloc(19);
  sof0.set([0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0.set([0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01], 9);
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, app0, sof0, eoi]);
}

describe("Presign (Section 93)", () => {
  it("401s unauthenticated, 403s a USER, and lets an ADMIN through", async () => {
    const { content } = await makeDraftMovie();
    const anon = await presignPoster({}, content.id);
    expect(anon.status).toBe(401);

    const { accessToken } = await createUser(app);
    const user = await presignPoster({ Authorization: `Bearer ${accessToken}` }, content.id);
    expect(user.status).toBe(403);

    const headers = await admin();
    const ok = await presignPoster(headers, content.id);
    expect(ok.status).toBe(201);
    expect(ok.body.data).toHaveProperty("assetId");
    expect(ok.body.data).toHaveProperty("uploadUrl");
    expect(JSON.stringify(ok.body)).not.toMatch(/storageKey/i);
  });

  it("404s a bad contentId", async () => {
    const headers = await admin();
    const res = await presignPoster(headers, "not-a-real-content-id");
    expect(res.status).toBe(404);
  });

  it("rejects a purpose that doesn't apply to the content's type", async () => {
    const headers = await admin();
    const { content: ebookContent } = await makeDraftEbook();
    const res = await request(app).post("/api/v1/admin/uploads/presign").set(headers).send({ contentId: ebookContent.id, purpose: "MOVIE_MASTER", fileName: "x.mp4", mimeType: "video/mp4", sizeBytes: 1000 });
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported MIME type for the purpose", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const res = await presignPoster(headers, content.id, { mimeType: "application/zip" });
    expect(res.status).toBe(400);
  });

  it("rejects an oversized file", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const res = await presignPoster(headers, content.id, { sizeBytes: 999_999_999_999 });
    expect(res.status).toBe(400);
  });
});

describe("Storage keys (Section 95)", () => {
  it("are unique per upload, safe, and prefixed by content", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const res1 = await presignPoster(headers, content.id);
    const res2 = await presignPoster(headers, content.id);
    const asset1 = await prisma.mediaAsset.findUnique({ where: { id: res1.body.data.assetId } });
    const asset2 = await prisma.mediaAsset.findUnique({ where: { id: res2.body.data.assetId } });
    expect(asset1!.storageKey).not.toBe(asset2!.storageKey);
    expect(asset1!.storageKey).toMatch(new RegExp(`^content/${content.id}/images/poster/`));
    expect(asset1!.storageKey).not.toMatch(/\.\./);
    expect(asset1!.storageKey).not.toContain("poster.jpg"); // never the raw filename
  });
});

describe("Complete (Section 94)", () => {
  it("errors when the object was never uploaded", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const presigned = await presignPoster(headers, content.id);
    const res = await request(app).post(`/api/v1/admin/uploads/${presigned.body.data.assetId}/complete`).set(headers);
    expect(res.status).toBe(400);
  });

  it("verifies the object, validates real image dimensions, and marks it READY", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const presigned = await presignPoster(headers, content.id, { sizeBytes: 500 });
    const jpeg = fakeJpeg(600, 900); // satisfies POSTER's 500x750 minimum
    await uploadBytes(presigned.body.data.uploadUrl, jpeg, "image/jpeg");

    const completed = await request(app).post(`/api/v1/admin/uploads/${presigned.body.data.assetId}/complete`).set(headers);
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe("READY");
    expect(completed.body.data.width).toBe(600);
    expect(completed.body.data.height).toBe(900);
    expect(JSON.stringify(completed.body)).not.toMatch(/storageKey/i);
  });

  it("rejects an image below the purpose's minimum dimensions", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const presigned = await presignPoster(headers, content.id, { sizeBytes: 500 });
    await uploadBytes(presigned.body.data.uploadUrl, fakeJpeg(100, 100), "image/jpeg");

    const completed = await request(app).post(`/api/v1/admin/uploads/${presigned.body.data.assetId}/complete`).set(headers);
    expect(completed.status).toBe(400);
    const asset = await prisma.mediaAsset.findUnique({ where: { id: presigned.body.data.assetId } });
    expect(asset!.status).toBe("FAILED");
  });

  it("is idempotent — completing an already-completed upload just returns its status", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const presigned = await presignPoster(headers, content.id, { sizeBytes: 500 });
    await uploadBytes(presigned.body.data.uploadUrl, fakeJpeg(600, 900), "image/jpeg");
    await request(app).post(`/api/v1/admin/uploads/${presigned.body.data.assetId}/complete`).set(headers);

    const again = await request(app).post(`/api/v1/admin/uploads/${presigned.body.data.assetId}/complete`).set(headers);
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe("READY");
  });
});

describe("Abort (Section 11)", () => {
  it("removes the pending upload and its object, leaving no orphan row", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const presigned = await presignPoster(headers, content.id, { sizeBytes: 500 });
    await uploadBytes(presigned.body.data.uploadUrl, fakeJpeg(600, 900), "image/jpeg");

    const res = await request(app).post(`/api/v1/admin/uploads/${presigned.body.data.assetId}/abort`).set(headers);
    expect(res.status).toBe(200);
    expect(await prisma.mediaAsset.findUnique({ where: { id: presigned.body.data.assetId } })).toBeNull();
  });

  it("refuses to abort an already-READY asset", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const presigned = await presignPoster(headers, content.id, { sizeBytes: 500 });
    await uploadBytes(presigned.body.data.uploadUrl, fakeJpeg(600, 900), "image/jpeg");
    await request(app).post(`/api/v1/admin/uploads/${presigned.body.data.assetId}/complete`).set(headers);

    const res = await request(app).post(`/api/v1/admin/uploads/${presigned.body.data.assetId}/abort`).set(headers);
    expect(res.status).toBe(409);
  });
});

describe("Status (Section 12)", () => {
  it("is pollable and never leaks the storage key", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const presigned = await presignPoster(headers, content.id);
    const res = await request(app).get(`/api/v1/admin/uploads/${presigned.body.data.assetId}/status`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("UPLOADING");
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/i);
  });
});
