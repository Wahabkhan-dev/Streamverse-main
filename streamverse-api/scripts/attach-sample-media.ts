/**
 * Phase 3: makes the SAMPLE catalog (seeded demo titles) really playable/readable by giving each one a real media file in R2.
 *
 * It goes through the running backend's own pipeline (presign -> R2 PUT -> verify -> processing -> READY -> attach), exactly as
 * an admin's browser does. Each title gets its own MediaAsset because the schema keeps a title's master video / EPUB / audio
 * one-to-one (UNIQUE) so that deleting or replacing one title's file can never break another's. Re-running is safe: titles that
 * already have their file are skipped. Titles created by the E2E suite or by an admin (not the seeded samples) are never touched.
 *
 *   npx tsx scripts/attach-sample-media.ts [movies|ebooks|audiobooks ...]
 */
import "dotenv/config";
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

const API = process.env["E2E_API_URL"] ?? "http://localhost:4000/api/v1";
const PUBLIC = resolve("../streamverse/public");
const FILES = {
  movies: { file: resolve(PUBLIC, "Angela - Video Trailer (1).mp4"), mime: "video/mp4", purpose: "MOVIE_MASTER", slot: "masterAssetId", group: "movie" },
  ebooks: { file: resolve(PUBLIC, "Reflowable 2.epub"), mime: "application/epub+zip", purpose: "EBOOK_EPUB", slot: "epubAssetId", group: "ebook" },
  audiobooks: { file: resolve(PUBLIC, "Voiceover rev.mp3"), mime: "audio/mpeg", purpose: "AUDIOBOOK_FILE", slot: "mainAssetId", group: "audiobook" },
} as const;

let token = "";
async function call<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  // the API rate-limits per IP; a long batch just waits its turn instead of failing
  for (let i = 0; res.status === 429 && i < 12; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }
  const json = (await res.json().catch(() => ({}))) as { data?: T; message?: string; errors?: Array<{ message: string }> };
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.message ?? ""} ${(json.errors ?? []).map((e) => e.message).join("; ")}`);
  return json.data as T;
}

async function uploadFile(kind: keyof typeof FILES): Promise<string> {
  const f = FILES[kind];
  const bytes = readFileSync(f.file);
  const p = await call<{ assetId: string; uploadUrl: string; headers: Record<string, string> }>("POST", "/admin/uploads/presign", { library: true, purpose: f.purpose, fileName: basename(f.file), mimeType: f.mime, sizeBytes: statSync(f.file).size });
  const put = await fetch(p.uploadUrl, { method: "PUT", headers: p.headers, body: bytes });
  if (!put.ok) throw new Error(`R2 PUT failed: ${put.status}`);
  await call("POST", `/admin/uploads/${p.assetId}/complete`);
  for (let i = 0; i < 300; i++) {
    const st = await call<{ status: string; processingError?: string }>("GET", `/admin/uploads/${p.assetId}/status`);
    if (st.status === "READY") return p.assetId;
    if (st.status === "FAILED") throw new Error(`processing failed: ${st.processingError}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("timed out waiting for READY");
}

async function main() {
  const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env["ADMIN_EMAIL"], password: process.env["ADMIN_PASSWORD"] }) });
  if (!login.ok) throw new Error(`admin login failed (${login.status})`);
  token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;

  const wanted = process.argv.slice(2).filter((a): a is keyof typeof FILES => a in FILES);
  const kinds = wanted.length ? wanted : (Object.keys(FILES) as Array<keyof typeof FILES>);
  const report: string[] = [];
  for (const kind of kinds) {
    const f = FILES[kind];
    const rows = await call<Array<Record<string, unknown>>>("GET", `/admin/${kind}?limit=100`);
    for (const row of rows) {
      const title = String(row["title"]);
      if (title.startsWith("E2E") || title.startsWith("Test")) continue; // never touch test-suite or hand-made titles
      const detail = await call<Record<string, Record<string, unknown>>>("GET", `/admin/${kind}/${String(row["id"])}`);
      if (detail[f.group]?.[f.slot]) {
        report.push(`skip   ${kind.padEnd(10)} ${title} (already has its file)`);
        continue;
      }
      const assetId = await uploadFile(kind);
      await call("PATCH", `/admin/${kind}/${String(row["id"])}`, { [f.group]: { [f.slot]: assetId } });
      report.push(`ATTACH ${kind.padEnd(10)} ${title} -> ${assetId}`);
      console.log(report.at(-1));
    }
  }
  console.log("\n" + report.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
