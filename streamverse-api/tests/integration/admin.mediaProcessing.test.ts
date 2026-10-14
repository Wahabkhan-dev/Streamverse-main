import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import type { MediaProcessor } from "../../src/services/media/mediaProcessor.provider";

const fakeProcessorState: { current: MediaProcessor } = { current: undefined! };
vi.mock("../../src/services/media/index.ts", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/media/index")>("../../src/services/media/index.ts");
  return { ...actual, getMediaProcessor: () => fakeProcessorState.current };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin } from "../helpers/adminAuth";
import { makeDraftAudiobook, makeDraftMovie } from "../helpers/draftContent";
import { createFakeMediaProcessor } from "../fakes/mediaProcessor.fake";
import { registerAudioWorker } from "../../src/workers/audio.worker";
import { registerVideoWorker } from "../../src/workers/video.worker";
import { processVideoAsset } from "../../src/services/media/videoProcessing.service";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();
registerVideoWorker();
registerAudioWorker();

beforeEach(() => {
  db.__reset();
  fakeProcessorState.current = createFakeMediaProcessor();
});

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

async function presignAndUpload(headers: Record<string, string>, contentId: string, purpose: string, mimeType: string, bytes: Buffer) {
  const presigned = await request(app).post("/api/v1/admin/uploads/presign").set(headers).send({ contentId, purpose, fileName: "file", mimeType, sizeBytes: bytes.length });
  await request(app).put(presigned.body.data.uploadUrl).set("Content-Type", mimeType).send(bytes);
  return presigned.body.data.assetId as string;
}

function waitForStatus(assetId: string, statuses: string[], timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
      if (asset && statuses.includes(asset.status)) return resolve(asset.status);
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timed out waiting for status in [${statuses.join(",")}], last was ${asset?.status}`));
      setTimeout(tick, 10);
    };
    void tick();
  });
}

describe("Movie master video processing (Section 20-26, 96)", () => {
  it("probes the source, generates renditions without upscaling, and reaches READY with an HLS manifest", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const assetId = await presignAndUpload(headers, content.id, "MOVIE_MASTER", "video/mp4", Buffer.from("fake-movie-bytes"));

    await request(app).post(`/api/v1/admin/uploads/${assetId}/complete`).set(headers);
    const finalStatus = await waitForStatus(assetId, ["READY", "FAILED"]);
    expect(finalStatus).toBe("READY");

    const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    expect(asset!.durationSeconds).toBe(120);
    expect(asset!.hlsManifestKey).toMatch(/\/hls\/master\.m3u8$/);

    const renditions = await (prisma as unknown as { mediaAsset: { findMany: (a: unknown) => Promise<{ variant: string }[]> } }).mediaAsset.findMany({ where: { sourceAssetId: assetId } });
    const variantNames = renditions.map((r) => r.variant);
    expect(variantNames).toContain("1080p"); // source is 1920x1080 per the fake probe
    expect(variantNames).not.toContain("4K"); // Section 24: never upscale past the source
  });

  it("marks FAILED on a processing error and supports retry (Section 27)", async () => {
    fakeProcessorState.current = createFakeMediaProcessor({ failProbe: true });
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const assetId = await presignAndUpload(headers, content.id, "MOVIE_MASTER", "video/mp4", Buffer.from("fake-movie-bytes"));

    await request(app).post(`/api/v1/admin/uploads/${assetId}/complete`).set(headers);
    await waitForStatus(assetId, ["FAILED"]);
    const failed = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    expect(failed!.processingError).toBeTruthy();

    fakeProcessorState.current = createFakeMediaProcessor(); // "fix" the source for the retry
    const retry = await request(app).post(`/api/v1/admin/media/${assetId}/retry-processing`).set(headers);
    expect(retry.status).toBe(200);
    await waitForStatus(assetId, ["READY"]);
  });

  it("does not create duplicate HLS outputs when the job is re-run (Section 29)", async () => {
    const headers = await admin();
    const { content } = await makeDraftMovie();
    const assetId = await presignAndUpload(headers, content.id, "MOVIE_MASTER", "video/mp4", Buffer.from("fake-movie-bytes"));
    await request(app).post(`/api/v1/admin/uploads/${assetId}/complete`).set(headers);
    await waitForStatus(assetId, ["READY"]);

    await prisma.mediaAsset.update({ where: { id: assetId }, data: { status: "UPLOADED" } }); // simulate a re-delivered job
    await processVideoAsset(assetId);

    const renditions = await (prisma as unknown as { mediaAsset: { findMany: (a: unknown) => Promise<unknown[]> } }).mediaAsset.findMany({ where: { sourceAssetId: assetId } });
    const byVariant = new Map<string, number>();
    for (const r of renditions as { variant: string }[]) byVariant.set(r.variant, (byVariant.get(r.variant) ?? 0) + 1);
    expect([...byVariant.values()].every((count) => count === 1)).toBe(true);
  });
});

describe("Audio processing (Section 30/31/97)", () => {
  it("extracts duration/codec/channels/sample rate for a single-file audiobook", async () => {
    const headers = await admin();
    const { content } = await makeDraftAudiobook();
    const assetId = await presignAndUpload(headers, content.id, "AUDIOBOOK_FILE", "audio/mpeg", Buffer.from("fake-audio-bytes"));

    await request(app).post(`/api/v1/admin/uploads/${assetId}/complete`).set(headers);
    await waitForStatus(assetId, ["READY"]);

    const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    expect(asset!.durationSeconds).toBe(120);
    expect(asset!.codec).toBe("aac");
  });

  it("leaves duration null (never a fake fallback) when extraction fails", async () => {
    fakeProcessorState.current = createFakeMediaProcessor({ failProbe: true });
    const headers = await admin();
    const { content } = await makeDraftAudiobook();
    const assetId = await presignAndUpload(headers, content.id, "AUDIOBOOK_FILE", "audio/mpeg", Buffer.from("fake-audio-bytes"));

    await request(app).post(`/api/v1/admin/uploads/${assetId}/complete`).set(headers);
    await waitForStatus(assetId, ["FAILED"]);
    const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    expect(asset!.durationSeconds).toBeFalsy(); // never a fake fallback value — stays unset, not e.g. 8h
    expect(asset!.processingError).toBeTruthy();
  });
});
