/**
 * Uploads the 8 demo movie poster images (src/assets/m1-m8.jpg) to Cloudflare R2,
 * creates one MediaAsset row per movie, and links them as posterAssetId on each Movie.
 * Each movie gets its own storage key (demo/posters/<slug>.jpg) even when the source
 * file is shared — posterAssetId is @unique so two movies cannot share one asset row.
 * Safe to re-run — skips any movie that already has a poster linked.
 *
 * Run:   npm run seed:demo:images
 * Undo:  npm run seed:demo:delete  (cascade/SetNull cleans up MediaAsset rows)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../src/config/database";

const s3 = new S3Client({
  region: process.env["AWS_REGION"] ?? "auto",
  endpoint: process.env["AWS_ENDPOINT"],
  credentials: {
    accessKeyId: process.env["AWS_ACCESS_KEY_ID"]!,
    secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"]!,
  },
  forcePathStyle: process.env["AWS_FORCE_PATH_STYLE"] === "true",
});

const BUCKET = process.env["AWS_BUCKET"]!;
const IMAGE_DIR = path.resolve(__dirname, "../../streamverse/src/assets");

// Each movie gets its own storage key. Reused source files (m1/m2) are uploaded
// once per slug so posterAssetId stays unique per Movie row.
const MOVIE_POSTER_MAP: { slug: string; sourceFile: string }[] = [
  { slug: "crimson-horizon",  sourceFile: "m1.jpg" },
  { slug: "neon-requiem",     sourceFile: "m2.jpg" },
  { slug: "the-last-crown",   sourceFile: "m3.jpg" },
  { slug: "velocity-zero",    sourceFile: "m4.jpg" },
  { slug: "glass-quiet",      sourceFile: "m5.jpg" },
  { slug: "abyssal",          sourceFile: "m6.jpg" },
  { slug: "roman-summer",     sourceFile: "m7.jpg" },
  { slug: "white-silence",    sourceFile: "m8.jpg" },
  { slug: "ember-protocol",   sourceFile: "m1.jpg" }, // same image, different key
  { slug: "midnight-ledger",  sourceFile: "m2.jpg" }, // same image, different key
];

async function uploadIfAbsent(storageKey: string, filePath: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey }));
    return false;
  } catch {
    // Not present — upload
  }
  const body = fs.readFileSync(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: body,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return true;
}

async function main() {
  console.log("StreamVerse — uploading demo poster images to R2...\n");
  if (!BUCKET) throw new Error("AWS_BUCKET is not set in .env");

  for (const { slug, sourceFile } of MOVIE_POSTER_MAP) {
    const content = await prisma.content.findUnique({
      where: { slug },
      include: { movie: { select: { contentId: true, posterAssetId: true } } },
    });
    if (!content) { console.log(`  SKIP  ${slug} — not found (run seed:demo first)`); continue; }
    if (content.movie?.posterAssetId) { console.log(`  skip  ${slug} — poster already linked`); continue; }

    // Each movie gets its own storage key so posterAssetId stays unique
    const storageKey = `demo/posters/${slug}.jpg`;
    const filePath = path.join(IMAGE_DIR, sourceFile);
    if (!fs.existsSync(filePath)) { console.log(`  WARN  ${slug} — ${filePath} not found`); continue; }

    const uploaded = await uploadIfAbsent(storageKey, filePath);
    const stats = fs.statSync(filePath);

    const asset = await prisma.mediaAsset.upsert({
      where: { storageKey },
      create: {
        contentId: content.id,
        type: "POSTER",
        storageKey,
        originalFileName: sourceFile,
        mimeType: "image/jpeg",
        sizeBytes: stats.size,
        status: "READY",
      },
      update: { status: "READY" },
    });

    await prisma.movie.update({
      where: { contentId: content.id },
      data: { posterAssetId: asset.id },
    });

    console.log(`  ${uploaded ? "↑" : "="}  ${storageKey}  (${Math.round(stats.size / 1024)}KB)  →  ${slug}`);
  }

  console.log("\nDone. All movie posters uploaded and linked.");
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
