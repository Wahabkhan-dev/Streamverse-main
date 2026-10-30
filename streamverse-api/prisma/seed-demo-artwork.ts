/**
 * Replaces the generated gradient artwork from seedDemo.ts with the template's real artwork
 * (streamverse/src/assets/m1-m8.jpg, 1920x1088 — above every image purpose's minimum size).
 *
 *   npx tsx prisma/seed-demo-artwork.ts   (uses DATABASE_URL + storage settings from the environment / .env)
 *
 * Covers every movie (poster, backdrop, thumbnail), ebook (front cover, thumbnail), audiobook (cover, thumbnail)
 * and banner (desktop, mobile). Goes through the same upload + update services as the admin panel, so the
 * replaced gradient images are scheduled for cleanup the normal way. Artwork is handed out round-robin so
 * neighbouring titles differ. Idempotent: anything already carrying this artwork ("art-" uploads) is skipped.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/config/database";
import { completeUpload, presignUpload } from "../src/services/upload.service";
import { updateMovie } from "../src/services/movie.service";
import { updateEbook } from "../src/services/ebook.service";
import { updateAudiobook } from "../src/services/audiobook.service";
import { updateBanner } from "../src/services/banner.service";
import type { AuditContext } from "../src/services/auditLog.service";

const ASSET_DIR = path.resolve(__dirname, "../../streamverse/src/assets");
const ARTWORK = ["m1.jpg", "m2.jpg", "m3.jpg", "m4.jpg", "m5.jpg", "m6.jpg", "m7.jpg", "m8.jpg"].map((f) => ({ file: f, data: readFileSync(path.join(ASSET_DIR, f)) }));
const MARKER = "art-";

let ctx: AuditContext;
let next = 0;
const pick = () => ARTWORK[next++ % ARTWORK.length]!;
const log = (m: string) => console.log(m);

async function upload(purpose: string, name: string, art: { file: string; data: Buffer }, contentId?: string): Promise<string> {
  const p = await presignUpload(
    { purpose, contentId, library: contentId ? undefined : true, fileName: `${MARKER}${name}-${purpose.toLowerCase()}-${art.file}`, mimeType: "image/jpeg", sizeBytes: art.data.length },
    ctx,
  );
  const res = await fetch(p.uploadUrl, { method: p.method, headers: p.headers, body: art.data });
  if (!res.ok) throw new Error(`storage upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const done = await completeUpload(p.assetId, ctx);
  if (done.status !== "READY") throw new Error(`${purpose} for ${name} ended as ${done.status}`);
  return p.assetId;
}

const alreadyDone = async (contentId: string) => !!(await prisma.mediaAsset.findFirst({ where: { contentId, originalFileName: { startsWith: MARKER } }, select: { id: true } }));

async function main() {
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!adminUser) throw new Error("No ADMIN user found — create one first (scripts/createAdmin.ts).");
  ctx = { userId: adminUser.id, ip: undefined, userAgent: "seedDemoArtwork", requestId: "seed-demo-artwork" };

  const titles = (type: "MOVIE" | "EBOOK" | "AUDIOBOOK") =>
    prisma.content.findMany({ where: { type, deletedAt: null }, select: { id: true, slug: true }, orderBy: { createdAt: "asc" } });

  log("Movies");
  for (const c of await titles("MOVIE")) {
    const art = pick();
    if (await alreadyDone(c.id)) { log(`  = ${c.slug}`); continue; }
    const posterAssetId = await upload("POSTER", c.slug, art, c.id);
    const backdropAssetId = await upload("BACKDROP", c.slug, art, c.id);
    const thumbnailAssetId = await upload("THUMBNAIL", c.slug, art, c.id);
    await updateMovie(c.id, { movie: { posterAssetId, backdropAssetId, thumbnailAssetId } } as never, ctx);
    log(`  + ${c.slug} <- ${art.file}`);
  }

  log("eBooks");
  for (const c of await titles("EBOOK")) {
    const art = pick();
    if (await alreadyDone(c.id)) { log(`  = ${c.slug}`); continue; }
    const frontCoverAssetId = await upload("EBOOK_FRONT_COVER", c.slug, art, c.id);
    const thumbnailAssetId = await upload("THUMBNAIL", c.slug, art, c.id);
    await updateEbook(c.id, { ebook: { frontCoverAssetId, thumbnailAssetId } } as never, ctx);
    log(`  + ${c.slug} <- ${art.file}`);
  }

  log("Audiobooks");
  for (const c of await titles("AUDIOBOOK")) {
    const art = pick();
    if (await alreadyDone(c.id)) { log(`  = ${c.slug}`); continue; }
    const coverAssetId = await upload("AUDIOBOOK_COVER", c.slug, art, c.id);
    const thumbnailAssetId = await upload("THUMBNAIL", c.slug, art, c.id);
    await updateAudiobook(c.id, { audiobook: { coverAssetId, thumbnailAssetId } } as never, ctx);
    log(`  + ${c.slug} <- ${art.file}`);
  }

  log("Banners");
  const banners = await prisma.banner.findMany({ select: { id: true, title: true, desktopAsset: { select: { type: true, originalFileName: true } } }, orderBy: { createdAt: "asc" } });
  for (const b of banners) {
    const art = pick();
    if (b.desktopAsset?.originalFileName?.startsWith(MARKER)) { log(`  = ${b.title}`); continue; }
    const name = `banner-${b.id}`;
    const desktopAssetId = await upload(b.desktopAsset?.type ?? "HERO_BANNER", name, art);
    const mobileAssetId = await upload("MOBILE_BANNER", name, art);
    await updateBanner(b.id, { desktopAssetId, mobileAssetId } as never, ctx);
    log(`  + ${b.title} <- ${art.file}`);
  }
  log("Done.");
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
