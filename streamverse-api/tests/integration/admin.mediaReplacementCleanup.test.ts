import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { prisma } from "../../src/config/database";
import { updateMovie } from "../../src/services/movie.service";
import { updateMovieSchema } from "../../src/validators/movie.validator";
import { makeDraftMovie } from "../helpers/draftContent";
import { runMediaCleanup } from "../../src/services/media/mediaCleanup.service";

const db = prisma as unknown as { __reset: () => void };

beforeEach(() => db.__reset());

const NO_ACTOR = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

async function readyAsset(type: string, contentId: string | null, extra: Record<string, unknown> = {}) {
  return (prisma as unknown as { mediaAsset: { create: (a: unknown) => Promise<{ id: string }> } }).mediaAsset.create({ data: { type, contentId, status: "READY", storageKey: `content/${contentId}/images/poster/${Math.random()}.jpg`, ...extra } });
}

describe("Media replacement (Section 44/45/68/102)", () => {
  it("switches the active poster atomically, and the old one is marked DELETED rather than destroyed immediately", async () => {
    const { content } = await makeDraftMovie();
    const oldPoster = await readyAsset("POSTER", content.id);
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: oldPoster.id } }), NO_ACTOR);

    const newPoster = await readyAsset("POSTER", content.id);
    const updated = await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: newPoster.id } }), NO_ACTOR);

    expect(updated.posterAssetId).toBe(newPoster.id); // new is active immediately
    const oldRow = await prisma.mediaAsset.findUnique({ where: { id: oldPoster.id } });
    expect(oldRow!.status).toBe("DELETED"); // old is scheduled for cleanup, not gone
    expect(oldRow!.deletedAt).toBeTruthy();

    const newRow = await prisma.mediaAsset.findUnique({ where: { id: newPoster.id } });
    expect(newRow!.status).toBe("READY"); // never switched before the new asset was confirmed ready
  });

  it("does not disturb an asset that was never replaced (same id resent)", async () => {
    const { content } = await makeDraftMovie();
    const poster = await readyAsset("POSTER", content.id);
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: poster.id } }), NO_ACTOR);
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: poster.id } }), NO_ACTOR);

    const row = await prisma.mediaAsset.findUnique({ where: { id: poster.id } });
    expect(row!.status).toBe("READY");
  });
});

describe("Media cleanup (Section 46/103)", () => {
  it("removes an expired pending upload", async () => {
    const asset = await (prisma as unknown as { mediaAsset: { create: (a: unknown) => Promise<{ id: string }> } }).mediaAsset.create({
      data: { type: "POSTER", status: "UPLOADING", storageKey: "content/x/images/poster/expired.jpg", expiresAt: new Date(Date.now() - 1000) },
    });
    const result = await runMediaCleanup();
    expect(result.expiredRemoved).toBeGreaterThanOrEqual(1);
    expect(await prisma.mediaAsset.findUnique({ where: { id: asset.id } })).toBeNull();
  });

  it("leaves a still-valid pending upload alone", async () => {
    const asset = await (prisma as unknown as { mediaAsset: { create: (a: unknown) => Promise<{ id: string }> } }).mediaAsset.create({
      data: { type: "POSTER", status: "UPLOADING", storageKey: "content/x/images/poster/fresh.jpg", expiresAt: new Date(Date.now() + 60_000) },
    });
    await runMediaCleanup();
    expect(await prisma.mediaAsset.findUnique({ where: { id: asset.id } })).not.toBeNull();
  });

  it("removes a DELETED, unreferenced asset once its grace period has passed", async () => {
    const asset = await readyAsset("POSTER", null);
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "DELETED", deletedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } });
    const result = await runMediaCleanup();
    expect(result.deletedRemoved).toBeGreaterThanOrEqual(1);
    expect(await prisma.mediaAsset.findUnique({ where: { id: asset.id } })).toBeNull();
  });

  it("preserves a DELETED asset that is still referenced by a slot, even past its grace period", async () => {
    const { content } = await makeDraftMovie();
    const poster = await readyAsset("POSTER", content.id);
    await updateMovie(content.id, updateMovieSchema.parse({ movie: { posterAssetId: poster.id } }), NO_ACTOR);
    // Force it into a DELETED+past-grace state directly (simulating an inconsistent/edge-case row) to
    // prove the cleanup job double-checks live references rather than trusting status alone.
    await prisma.mediaAsset.update({ where: { id: poster.id }, data: { status: "DELETED", deletedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } });

    await runMediaCleanup();
    expect(await prisma.mediaAsset.findUnique({ where: { id: poster.id } })).not.toBeNull();
  });
});
