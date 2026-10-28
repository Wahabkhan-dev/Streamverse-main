import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { asAdmin } from "./lib/auth";
import { ADMIN_STATE, FIXTURES } from "./lib/env";
import { track } from "./lib/net";

/**
 * Real files of every supported kind, uploaded through the Media Library UI to the real R2 bucket, verified by the
 * backend, processed (video -> HLS, audio -> probed), and checked against R2 and MySQL. Runs in the no-CORS project:
 * the browser PUTs to R2 directly, which needs bucket CORS (BLOCKED EXTERNAL; see cors.live.spec.ts).
 */
test.use({ storageState: ADMIN_STATE });

const admin = () => asAdmin();
type Json = Record<string, unknown>;
const stats = async () =>
  (await admin().get<{ total: number; storageBytes: number }>("/admin/media/stats")).data;

const FILES: Array<{
  file: string;
  type: string;
  category: string;
  mime: string;
  checks: (d: Json) => void;
}> = [
  {
    file: "poster.jpg",
    type: "LIBRARY_IMAGE",
    category: "images",
    mime: "image/jpeg",
    checks: (d) => expect([d["width"], d["height"]]).toEqual([600, 900]),
  },
  {
    file: "movie.mp4",
    type: "MOVIE_MASTER",
    category: "videos",
    mime: "video/mp4",
    checks: (d) => expect(Number(d["durationSeconds"])).toBeGreaterThan(0),
  },
  {
    file: "audiobook.mp3",
    type: "AUDIOBOOK_FILE",
    category: "audio",
    mime: "audio/mpeg",
    checks: (d) => expect(Number(d["durationSeconds"])).toBeGreaterThan(0),
  },
  {
    file: "book.epub",
    type: "EBOOK_EPUB",
    category: "documents",
    mime: "application/epub+zip",
    checks: () => undefined,
  },
  {
    file: "book.pdf",
    type: "EBOOK_PDF",
    category: "documents",
    mime: "application/pdf",
    checks: () => undefined,
  },
];

test("an image, a small video, audio, an EPUB and a PDF upload through the UI, verify against R2 and MySQL, and delete cleanly", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const net = track(page);
  const before = await stats();

  await page.goto("/admin/media");
  await page.getByTestId("upload-open").click();
  // all five at once: per-file and overall progress, three in flight at a time
  await page
    .getByTestId("media-file-input")
    .setInputFiles(FILES.map((f) => join(FIXTURES, f.file)));
  await expect(page.getByTestId("upload-row")).toHaveCount(FILES.length);
  const rows = page.getByTestId("upload-row");
  for (let i = 0; i < FILES.length; i++)
    await expect(rows.nth(i)).toHaveAttribute("data-stage", "ready", { timeout: 180_000 });
  await page.keyboard.press("Escape");

  const created: string[] = [];
  try {
    for (const f of FILES) {
      const res = (await (
        await admin().raw(
          "GET",
          `/admin/media?search=${encodeURIComponent(f.file)}&category=${f.category}&limit=5`,
        )
      ).json()) as {
        data: Array<{ id: string; type: string; fileName: string; usageCount: number }>;
      };
      const hit = res.data.find(
        (x) => x.fileName === f.file && x.type === f.type && x.usageCount === 0,
      );
      expect(hit, `${f.file} is in the library as ${f.type}`).toBeTruthy();
      created.push(hit!.id);

      const d = (await admin().get<Json>(`/admin/media/${hit!.id}`)).data;
      expect(d["status"], `${f.file} is READY`).toBe("READY");
      expect(d["mimeType"]).toBe(f.mime);
      expect(d["protected"], "only pictures are ever public").toBe(f.category !== "images");
      f.checks(d);
      // the object is really in R2 with the size the backend recorded
      const obj = await fetch(String(d["previewUrl"]));
      expect(obj.status, `${f.file} exists in R2`).toBe(200);
      expect((await obj.arrayBuffer()).byteLength).toBe(Number(d["sizeBytes"]));
      // organised key, not the file name
      expect(String(d["objectKey"])).toMatch(/^media\/[a-z/-]+\/[0-9a-f-]+\.[a-z0-9]+$/);
      expect(String(d["objectKey"])).not.toContain(f.file);
    }
    // the video produced its HLS renditions on R2
    const video = (await admin().get<Json>(`/admin/media/${created[1]}`)).data;
    expect((video["renditions"] as unknown[]).length).toBeGreaterThan(0);
    expect(net.bad()).toEqual([]);
  } finally {
    // cleanup: storage first, then the rows; the library returns to its starting size
    for (const id of created) {
      const r = await admin().raw("DELETE", `/admin/media/${id}`);
      expect(r.status, `delete ${id}`).toBe(200);
    }
  }
  const after = await stats();
  expect(after.total).toBe(before.total);
  expect(after.storageBytes).toBe(before.storageBytes);
});
