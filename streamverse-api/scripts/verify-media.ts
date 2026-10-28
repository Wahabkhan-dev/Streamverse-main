/**
 * Verifies seeded content against reality: every MediaAsset row for the given content ids must (a) hold a plain
 * storage key (never a signed URL), (b) have a matching object in R2 (HEAD), with the same size, and
 * (c) be in a sensible status. Read-only. Run: npx tsx scripts/verify-media.ts <contentId> [<contentId>...]
 */
import { prisma } from "../src/config/database";
import { getStorageProvider } from "../src/services/storage";

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error("pass at least one content id");
  const storage = getStorageProvider();
  const rows: Array<Record<string, unknown>> = [];
  let problems = 0;

  for (const contentId of ids) {
    const content = await prisma.content.findUnique({ where: { id: contentId }, select: { title: true, type: true, status: true } });
    const assets = await prisma.mediaAsset.findMany({ where: { contentId }, orderBy: { createdAt: "asc" } });
    // include renditions generated from a source asset (HLS ladder)
    const renditions = await prisma.mediaAsset.findMany({ where: { sourceAssetId: { in: assets.map((a) => a.id) } } });
    const seen = new Set<string>();
    for (const a of [...assets, ...renditions]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      if (a.deletedAt) continue;
      const key = a.storageKey ?? "";
      const head = key ? await storage.headObject(key) : { exists: false, sizeBytes: undefined };
      const keyIsPlain = !!key && !/^https?:\/\//i.test(key) && !/X-Amz-/i.test(key);
      const sizeOk = !head.exists || a.sizeBytes == null || head.sizeBytes === a.sizeBytes || a.type.includes("RENDITION") || a.type.includes("HLS");
      const ok = head.exists && keyIsPlain && a.status === "READY" && sizeOk;
      if (!ok) problems++;
      rows.push({
        content: `${content?.type}:${content?.title}[${content?.status}]`,
        asset: a.type,
        status: a.status,
        key: key.length > 58 ? `${key.slice(0, 55)}...` : key,
        keyIsPlain,
        inR2: head.exists,
        dbSize: a.sizeBytes,
        r2Size: head.sizeBytes,
        mime: a.mimeType,
        ok,
      });
    }
  }
  console.table(rows);
  console.log(problems === 0 ? `ALL ${rows.length} ASSETS VERIFIED (DB row + plain key + object in R2 + READY)` : `${problems} PROBLEM ASSET(S)`);
  await prisma.$disconnect();
  process.exit(problems === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
