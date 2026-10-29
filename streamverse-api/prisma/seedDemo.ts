/**
 * Demo catalog seed: movies, ebooks, audiobooks, collections, banners, homepage sections and subscription plans.
 *
 *   npx tsx prisma/seedDemo.ts            (uses DATABASE_URL + storage settings from the environment / .env)
 *
 * Goes through the app's own services (the same ones the admin panel calls), so every title passes the normal publish
 * checks. Placeholder artwork, a short sample video, audio and an EPUB are generated here and uploaded to the configured
 * storage. Idempotent: anything that already exists (by slug / key) is skipped, so it is safe to re-run.
 *
 * The plans use placeholder Stripe price ids ("price_demo_*"): they show on the pricing page but cannot be purchased
 * until real Stripe prices are linked in the admin panel.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { prisma } from "../src/config/database";
import { registerAudioWorker } from "../src/workers/audio.worker";
import { registerVideoWorker } from "../src/workers/video.worker";
import { createSlugFromTitle } from "../src/services/slug.service";
import { completeUpload, presignUpload } from "../src/services/upload.service";
import { createMovie, updateMovie } from "../src/services/movie.service";
import { createEbook, updateEbook } from "../src/services/ebook.service";
import { createAudiobook, updateAudiobook } from "../src/services/audiobook.service";
import { publishContent } from "../src/services/contentStatus.service";
import { addItem as addCollectionItem, createCollection, updateCollection } from "../src/services/collection.service";
import { createBanner } from "../src/services/banner.service";
import { addItem as addSectionItem, createSection } from "../src/services/homepage.service";
import { createPlan } from "../src/services/billing/plan.service";
import type { AuditContext } from "../src/services/auditLog.service";

/* ------------------------------------------------------------------ generated media */

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

type RGB = [number, number, number];
/** [from, to, accent] */
type Palette = [RGB, RGB, RGB];
const PALETTES: Palette[] = [
  [[40, 18, 70], [210, 70, 90], [255, 190, 120]],
  [[10, 40, 70], [30, 150, 170], [200, 245, 235]],
  [[25, 25, 35], [90, 60, 150], [250, 220, 120]],
  [[60, 20, 20], [200, 110, 50], [255, 235, 190]],
  [[10, 50, 40], [60, 160, 110], [230, 250, 200]],
  [[30, 30, 80], [80, 120, 220], [255, 200, 230]],
  [[70, 30, 60], [220, 100, 150], [255, 240, 210]],
];
const paletteFor = (seed: string): Palette => PALETTES[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTES.length]!;

/** A smooth gradient with a soft glowing circle and diagonal light bands — placeholder artwork, no text. */
function artPng(w: number, h: number, seed: string): Buffer {
  const [a, b, accent] = paletteFor(seed);
  const hash = [...seed].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7);
  const cx = (0.25 + ((hash % 50) / 100)) * w;
  const cy = (0.3 + (((hash >> 6) % 40) / 100)) * h;
  const radius = Math.min(w, h) * 0.38;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x / w) * 0.45 + (y / h) * 0.55;
      let r = a[0] + (b[0] - a[0]) * t;
      let g = a[1] + (b[1] - a[1]) * t;
      let bl = a[2] + (b[2] - a[2]) * t;
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d < 1) {
        const k = (1 - d) ** 2 * 0.85;
        r += (accent[0] - r) * k; g += (accent[1] - g) * k; bl += (accent[2] - bl) * k;
      }
      const band = Math.sin((x + y) / (Math.min(w, h) * 0.09)) * 7;
      const i = row + 1 + x * 3;
      raw[i] = Math.max(0, Math.min(255, r + band));
      raw[i + 1] = Math.max(0, Math.min(255, g + band));
      raw[i + 2] = Math.max(0, Math.min(255, bl + band));
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

/** A stored (uncompressed) ZIP — enough for an EPUB. The `mimetype` entry must come first. */
function zip(entries: { name: string; data: string }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const data = Buffer.from(e.data, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, name, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0x21, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function epub(title: string, author: string, blurb: string): Buffer {
  const chapters = [1, 2, 3].map((n) => ({
    id: `c${n}`,
    file: `chapter${n}.xhtml`,
    title: `Chapter ${n}`,
    body: `<h1>Chapter ${n}</h1><p>${xmlEscape(blurb)}</p><p>This is sample text for the demo edition of <em>${xmlEscape(title)}</em> by ${xmlEscape(author)}. Replace this file with the real book in the admin panel.</p><p>The page you are reading is part of a generated EPUB so the reader, bookmarks and progress tracking can be tried out end to end.</p>`,
  }));
  const xhtml = (t: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xmlEscape(t)}</title></head><body>${body}</body></html>`;
  return zip([
    { name: "mimetype", data: "application/epub+zip" },
    { name: "META-INF/container.xml", data: `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>` },
    {
      name: "OEBPS/content.opf",
      data: `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:streamverse:${createSlugFromTitle(title)}</dc:identifier><dc:title>${xmlEscape(title)}</dc:title><dc:creator>${xmlEscape(author)}</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((c) => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine>${chapters.map((c) => `<itemref idref="${c.id}"/>`).join("")}</spine></package>`,
    },
    { name: "OEBPS/nav.xhtml", data: xhtml("Contents", `<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><ol>${chapters.map((c) => `<li><a href="${c.file}">${c.title}</a></li>`).join("")}</ol></nav>`) },
    ...chapters.map((c) => ({ name: `OEBPS/${c.file}`, data: xhtml(c.title, c.body) })),
  ]);
}

const FFMPEG = process.env["FFMPEG_PATH"] || "ffmpeg";
function ffmpeg(args: string[]): void {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error?.message}`);
}

/* ------------------------------------------------------------------ helpers */

let admin: { id: string };
let ctx: AuditContext;
const tmp = mkdtempSync(path.join(tmpdir(), "sv-demo-"));
let sampleVideo: Buffer;
let sampleAudio: { data: Buffer; mime: string; ext: string };

const log = (m: string) => console.log(m);

async function waitReady(assetId: string): Promise<void> {
  for (let i = 0; i < 180; i++) {
    const a = await prisma.mediaAsset.findUnique({ where: { id: assetId }, select: { status: true, processingError: true } });
    if (a?.status === "READY") return;
    if (a?.status === "FAILED") throw new Error(`asset ${assetId} failed: ${a.processingError}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`asset ${assetId} did not become READY in time`);
}

async function upload(o: { purpose: string; contentId?: string; library?: boolean; fileName: string; mimeType: string; data: Buffer }): Promise<string> {
  const p = await presignUpload({ purpose: o.purpose, contentId: o.contentId, library: o.library, fileName: o.fileName, mimeType: o.mimeType, sizeBytes: o.data.length }, ctx);
  const res = await fetch(p.uploadUrl, { method: p.method, headers: p.headers, body: o.data });
  if (!res.ok) throw new Error(`storage upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  await completeUpload(p.assetId, ctx);
  await waitReady(p.assetId);
  return p.assetId;
}

const image = (purpose: string, seed: string, w: number, h: number, contentId?: string) =>
  upload({ purpose, contentId, library: contentId ? undefined : true, fileName: `${createSlugFromTitle(seed)}-${purpose.toLowerCase()}.png`, mimeType: "image/png", data: artPng(w, h, seed) });

/** True when the title is already live. A half-finished one (an earlier run that failed part-way) is removed so it is rebuilt cleanly. */
const exists = async (title: string) => {
  const row = await prisma.content.findUnique({ where: { slug: createSlugFromTitle(title) }, select: { id: true, status: true } });
  if (!row) return false;
  if (row.status === "PUBLISHED") return true;
  await prisma.mediaAsset.deleteMany({ where: { contentId: row.id } });
  await prisma.content.delete({ where: { id: row.id } });
  return false;
};

let genreIds: Map<string, string>;
let languageId: string;
const genres = (...names: string[]) => names.map((n) => genreIds.get(n)).filter((x): x is string => !!x);

/* ------------------------------------------------------------------ catalog definitions */

interface Promo { featured?: boolean; trending?: boolean; popular?: boolean; newRelease?: boolean }
interface MovieDef { title: string; summary: string; description: string; genres: string[]; minutes: number; year: number; rating: string; minAge?: number; studio: string; country: string; cast: [string, string][]; director: string; promo: Promo }
const MOVIES: MovieDef[] = [
  { title: "Crimson Horizon", summary: "A lone pilot chases a signal that should not exist across a dying sun.", description: "When a deep-space relay starts answering messages sent a hundred years ago, pilot Ada Voss is sent to find out who is on the other end. What she finds rewrites everything humanity believed about the edge of the solar system.", genres: ["Sci-Fi", "Thriller"], minutes: 148, year: 2026, rating: "PG-13", studio: "Northlight Pictures", country: "US", cast: [["Elena Marsh", "Ada Voss"], ["Kai Tanaka", "Commander Reyes"]], director: "Ines Calder", promo: { featured: true, trending: true, newRelease: true } },
  { title: "Glass Quiet", summary: "Two strangers share a silent apartment wall and an unexpected correspondence.", description: "In a city that never stops talking, a translator and a night-shift baker begin leaving notes through a thin wall. A gentle, sharply observed drama about loneliness, kindness and the people next door.", genres: ["Drama", "Romance"], minutes: 112, year: 2025, rating: "PG", studio: "Harbor Lane Films", country: "GB", cast: [["Priya Nair", "Mara"], ["Tom Ellery", "Jonah"]], director: "Lucas Bright", promo: { featured: true, popular: true } },
  { title: "Abyssal", summary: "Eleven kilometres down, the crew finds they are not the deepest thing in the ocean.", description: "A deep-sea research crew loses contact with the surface and discovers something moving in the trench below. Claustrophobic, tense and beautifully shot.", genres: ["Sci-Fi", "Horror"], minutes: 127, year: 2026, rating: "R", minAge: 16, studio: "Deepwater Studio", country: "CA", cast: [["Nora Whitfield", "Dr. Okafor"], ["Ben Castillo", "Captain Hale"]], director: "Rafael Moreno", promo: { trending: true, newRelease: true } },
  { title: "Midnight Ledger", summary: "An accountant finds a ledger that rewrites a city's history, one entry at a time.", description: "Forensic accountant Theo Marsh inherits a leather-bound ledger whose entries change the past every time he reads them aloud. A twisty crime mystery about debts that can't be paid.", genres: ["Crime", "Mystery"], minutes: 112, year: 2024, rating: "PG-13", studio: "Ironwood Pictures", country: "US", cast: [["Daniel Osei", "Theo Marsh"], ["Lina Voigt", "Inspector Brandt"]], director: "Mei Lin Zhao", promo: { popular: true } },
  { title: "Paper Lanterns", summary: "A girl and her grandfather follow a trail of lanterns to a hidden festival.", description: "A hand-drawn adventure for the whole family about a night market that only appears once a year, and the little spirits who keep it glowing.", genres: ["Animation", "Adventure"], minutes: 96, year: 2025, rating: "G", studio: "Moonbridge Animation", country: "JP", cast: [["Yuki Hara", "Hana"], ["Ken Mori", "Grandfather"]], director: "Aiko Sato", promo: { featured: true, newRelease: true, popular: true } },
];

interface BookDef { title: string; author: string; narrator?: string; summary: string; description: string; genres: string[]; pages?: number; year: number; promo: Promo }
const EBOOKS: BookDef[] = [
  { title: "The Quiet Tide", author: "Mira Halloran", summary: "A harbour town, a missing boat and a secret the sea keeps returning.", description: "When fisherman's daughter Nell finds an empty boat drifting into port, the town's long-buried secrets begin washing ashore. A slow-burning coastal mystery.", genres: ["Mystery", "Drama"], pages: 312, year: 2025, promo: { featured: true, popular: true } },
  { title: "Atlas of Small Things", author: "Jonas Wren", summary: "Short, practical essays on noticing more and worrying less.", description: "Forty small essays on attention, habits and the ordinary details that make days feel full. Read one a morning.", genres: ["Self-Help"], pages: 188, year: 2024, promo: { featured: true } },
  { title: "Ember & Ash", author: "Selene Park", summary: "A fire-mage apprentice learns what her city burned to stay warm.", description: "In a city powered by captured flame, apprentice Wren discovers the price of its light. The first book of a fast, character-driven fantasy trilogy.", genres: ["Fantasy", "Adventure"], pages: 420, year: 2026, promo: { trending: true, newRelease: true } },
  { title: "The Long Orbit", author: "Dev Anand Rao", summary: "Twelve people, one generation ship and a thousand-year decision.", description: "Halfway between stars, the crew of the Anchorage must decide whether to turn back. Thoughtful, human science fiction.", genres: ["Sci-Fi"], pages: 356, year: 2025, promo: { popular: true, newRelease: true } },
];
const AUDIOBOOKS: BookDef[] = [
  { title: "Salt Road", author: "Tom Brisk", narrator: "Amelia Stone", summary: "Three traders cross a desert on the last caravan route.", description: "An adventure across the old salt road, told in a warm, rolling voice. About ten hours of travel, trouble and unexpected friendship.", genres: ["Adventure", "Drama"], year: 2025, promo: { featured: true, popular: true } },
  { title: "The Lighthouse Keeper's Daughter", author: "Clara Bennett", narrator: "Oliver Grant", summary: "A storm, a lamp that won't light and a promise made long ago.", description: "On a remote island, a young woman takes over her father's lighthouse and finds his logbooks hide more than weather reports.", genres: ["Drama", "Mystery"], year: 2024, promo: { trending: true } },
  { title: "Neon Garden", author: "Ravi Menon", narrator: "Sofia Alvarez", summary: "A botanist grows the only real garden in a city made of light.", description: "A near-future story of a rooftop garden, a corporate takeover and the people who tend things that can't be copied.", genres: ["Sci-Fi", "Thriller"], year: 2026, promo: { newRelease: true, trending: true } },
];

/* ------------------------------------------------------------------ seeding */

async function seedMovies(): Promise<string[]> {
  const ids: string[] = [];
  for (const m of MOVIES) {
    if (await exists(m.title)) { log(`  = movie exists: ${m.title}`); ids.push((await prisma.content.findUnique({ where: { slug: createSlugFromTitle(m.title) } }))!.id); continue; }
    const { content } = await createMovie({
      title: m.title, manualSlug: createSlugFromTitle(m.title), summary: m.summary, description: m.description, visibility: "PUBLIC", releaseDate: new Date(`${m.year}-03-15`),
      age: { ageRating: m.rating, ageRestricted: !!m.minAge, minimumAge: m.minAge }, promo: { featured: false, trending: false, popular: false, newRelease: false, ...m.promo },
      movie: { runtimeMinutes: m.minutes, productionStudio: m.studio, countryOfOrigin: m.country, copyrightOwner: m.studio, copyrightYear: m.year },
      genreIds: genres(...m.genres), tagIds: [], warningTypeIds: [], languages: [{ languageId, role: "PRIMARY" }],
      cast: m.cast.map(([name, characterName], i) => ({ name, characterName, displayOrder: i })), crew: [{ name: m.director, role: "DIRECTOR", displayOrder: 0 }], captions: [], audioTracks: [],
    } as never, ctx);
    const posterAssetId = await image("POSTER", m.title, 600, 900, content.id);
    const backdropAssetId = await image("BACKDROP", `${m.title}-b`, 1280, 720, content.id);
    const thumbnailAssetId = await image("THUMBNAIL", `${m.title}-t`, 480, 270, content.id);
    const masterAssetId = await upload({ purpose: "MOVIE_MASTER", contentId: content.id, fileName: `${createSlugFromTitle(m.title)}.mp4`, mimeType: "video/mp4", data: sampleVideo });
    await updateMovie(content.id, { movie: { posterAssetId, backdropAssetId, thumbnailAssetId, masterAssetId } } as never, ctx);
    await publishContent("MOVIE", content.id, ctx);
    ids.push(content.id);
    log(`  + movie: ${m.title}`);
  }
  return ids;
}

async function seedEbooks(): Promise<string[]> {
  const ids: string[] = [];
  for (const b of EBOOKS) {
    if (await exists(b.title)) { log(`  = ebook exists: ${b.title}`); ids.push((await prisma.content.findUnique({ where: { slug: createSlugFromTitle(b.title) } }))!.id); continue; }
    const { content } = await createEbook({
      title: b.title, manualSlug: createSlugFromTitle(b.title), summary: b.summary, description: b.description, visibility: "PUBLIC", releaseDate: new Date(`${b.year}-02-01`),
      age: { ageRating: "All", ageRestricted: false }, promo: { featured: false, trending: false, popular: false, newRelease: false, ...b.promo },
      ebook: { author: b.author, publisher: "StreamVerse Press", pageCount: b.pages, publicationDate: new Date(`${b.year}-02-01`), copyrightOwner: b.author, copyrightYear: b.year },
      genreIds: genres(...b.genres), tagIds: [], warningTypeIds: [], languages: [{ languageId, role: "PRIMARY" }],
    } as never, ctx);
    const frontCoverAssetId = await image("EBOOK_FRONT_COVER", b.title, 600, 900, content.id);
    const thumbnailAssetId = await image("THUMBNAIL", `${b.title}-t`, 480, 270, content.id);
    const epubData = epub(b.title, b.author, b.summary);
    const epubAssetId = await upload({ purpose: "EBOOK_EPUB", contentId: content.id, fileName: `${createSlugFromTitle(b.title)}.epub`, mimeType: "application/epub+zip", data: epubData });
    await updateEbook(content.id, { ebook: { frontCoverAssetId, thumbnailAssetId, epubAssetId } } as never, ctx);
    await publishContent("EBOOK", content.id, ctx);
    ids.push(content.id);
    log(`  + ebook: ${b.title}`);
  }
  return ids;
}

async function seedAudiobooks(): Promise<string[]> {
  const ids: string[] = [];
  for (const b of AUDIOBOOKS) {
    if (await exists(b.title)) { log(`  = audiobook exists: ${b.title}`); ids.push((await prisma.content.findUnique({ where: { slug: createSlugFromTitle(b.title) } }))!.id); continue; }
    const { content } = await createAudiobook({
      title: b.title, manualSlug: createSlugFromTitle(b.title), summary: b.summary, description: b.description, visibility: "PUBLIC", releaseDate: new Date(`${b.year}-04-01`),
      age: { ageRating: "All", ageRestricted: false }, promo: { featured: false, trending: false, popular: false, newRelease: false, ...b.promo },
      audiobook: { author: b.author, narrator: b.narrator, publisher: "StreamVerse Audio", releaseDate: new Date(`${b.year}-04-01`), deliveryMode: "SINGLE_FILE", copyrightOwner: b.author, copyrightYear: b.year },
      genreIds: genres(...b.genres), tagIds: [], warningTypeIds: [], languages: [{ languageId, role: "PRIMARY" }],
    } as never, ctx);
    const coverAssetId = await image("AUDIOBOOK_COVER", b.title, 600, 600, content.id);
    const thumbnailAssetId = await image("THUMBNAIL", `${b.title}-t`, 480, 270, content.id);
    const mainAssetId = await upload({ purpose: "AUDIOBOOK_FILE", contentId: content.id, fileName: `${createSlugFromTitle(b.title)}.${sampleAudio.ext}`, mimeType: sampleAudio.mime, data: sampleAudio.data });
    await updateAudiobook(content.id, { audiobook: { coverAssetId, thumbnailAssetId, mainAssetId } } as never, ctx);
    await publishContent("AUDIOBOOK", content.id, ctx);
    ids.push(content.id);
    log(`  + audiobook: ${b.title}`);
  }
  return ids;
}

async function seedCollections(movies: string[], ebooks: string[], audiobooks: string[]): Promise<Record<string, string>> {
  const defs = [
    { name: "Staff Picks", description: "Our team's favourites across movies, books and audio.", items: [movies[0]!, movies[1]!, ebooks[0]!, audiobooks[0]!] },
    { name: "Weekend Binge", description: "Settle in: the best films to watch back to back.", items: [movies[0]!, movies[2]!, movies[3]!, movies[4]!] },
    { name: "Quiet Reads & Listens", description: "Slow, absorbing stories for a calm evening.", items: [ebooks[0]!, ebooks[1]!, audiobooks[1]!, audiobooks[0]!] },
  ];
  const out: Record<string, string> = {};
  for (const d of defs) {
    const slug = createSlugFromTitle(d.name);
    const existing = await prisma.collection.findUnique({ where: { slug } });
    if (existing) { log(`  = collection exists: ${d.name}`); out[d.name] = existing.id; continue; }
    const c = await createCollection({ name: d.name, manualSlug: slug, description: d.description }, ctx);
    for (const [i, contentId] of d.items.entries()) await addCollectionItem(c.id, { contentId, displayOrder: i }, ctx);
    await updateCollection(c.id, { status: "PUBLISHED" }, ctx);
    out[d.name] = c.id;
    log(`  + collection: ${d.name}`);
  }
  return out;
}

async function seedBanners(movies: string[], ebooks: string[], audiobooks: string[]): Promise<void> {
  const defs: { title: string; description: string; type: "HERO" | "NORMAL" | "LATEST_RELEASE" | "PROMOTIONAL"; placement?: "MOVIES" | "EBOOKS" | "AUDIOBOOKS"; purpose: string; w: number; h: number; link?: string; sub?: boolean; home?: boolean; after?: string; button: string }[] = [
    { title: "Crimson Horizon is here", description: "The new sci-fi thriller everyone is talking about.", type: "HERO", placement: "MOVIES", purpose: "HERO_BANNER", w: 1920, h: 800, link: movies[0], button: "Watch now" },
    { title: "Fall into a good book", description: "Fresh eBooks added every week.", type: "HERO", placement: "EBOOKS", purpose: "HERO_BANNER", w: 1920, h: 800, link: ebooks[2], button: "Read now" },
    { title: "Stories for your ears", description: "Audiobooks narrated by the best voices.", type: "HERO", placement: "AUDIOBOOKS", purpose: "HERO_BANNER", w: 1920, h: 800, link: audiobooks[0], button: "Listen now" },
    { title: "Unlimited stories. One subscription.", description: "Movies, eBooks and audiobooks in one place. Cancel anytime.", type: "PROMOTIONAL", purpose: "NORMAL_BANNER", w: 1200, h: 400, sub: true, home: true, after: "trending_movies", button: "See plans" },
    { title: "Latest release: Abyssal", description: "Eleven kilometres down, something is waiting.", type: "LATEST_RELEASE", purpose: "LATEST_RELEASE_BANNER", w: 1200, h: 400, link: movies[2], home: true, after: "new_releases", button: "Watch now" },
  ];
  for (const d of defs) {
    if (await prisma.banner.findFirst({ where: { title: d.title } })) { log(`  = banner exists: ${d.title}`); continue; }
    const desktopAssetId = await image(d.purpose, d.title, d.w, d.h);
    const mobileAssetId = await image("MOBILE_BANNER", `${d.title}-m`, 750, 1000);
    await createBanner({
      type: d.type, title: d.title, description: d.description, desktopAssetId, mobileAssetId, linkedContentId: d.link, placement: d.placement, linkToSubscription: d.sub ?? false,
      showOnHomepage: d.home ?? false, homepageAfter: d.after, buttonText: d.button, priority: 1, active: true,
    } as never, ctx);
    log(`  + banner: ${d.title}`);
  }
}

async function seedHomepage(movies: string[], ebooks: string[], audiobooks: string[], collections: Record<string, string>): Promise<void> {
  const sections: { key: string; displayTitle: string; type: string; contentType?: "MOVIE" | "EBOOK" | "AUDIOBOOK"; collectionId?: string; items?: string[]; limit?: number }[] = [
    { key: "hero", displayTitle: "Featured", type: "HERO", items: [movies[0]!, ebooks[2]!, audiobooks[0]!, movies[1]!], limit: 6 },
    { key: "trending_movies", displayTitle: "Trending Movies", type: "TRENDING", contentType: "MOVIE" },
    { key: "new_releases", displayTitle: "New Releases", type: "NEW_RELEASE", contentType: "MOVIE" },
    { key: "featured_ebooks", displayTitle: "Featured eBooks", type: "FEATURED", contentType: "EBOOK" },
    { key: "popular_audiobooks", displayTitle: "Popular Audiobooks", type: "POPULAR", contentType: "AUDIOBOOK" },
    { key: "staff_picks", displayTitle: "Staff Picks", type: "COLLECTION", collectionId: collections["Staff Picks"] },
  ];
  for (const [order, s] of sections.entries()) {
    if (await prisma.homepageSection.findUnique({ where: { key: s.key } })) { log(`  = section exists: ${s.key}`); continue; }
    const row = await createSection({ key: s.key, displayTitle: s.displayTitle, enabled: true, displayOrder: order, itemLimit: s.limit ?? 12, type: s.type, contentType: s.contentType, collectionId: s.collectionId } as never, ctx);
    for (const [i, contentId] of (s.items ?? []).entries()) await addSectionItem(row.id, { contentId, displayOrder: i }, ctx);
    log(`  + homepage section: ${s.displayTitle}`);
  }
}

async function seedPlans(): Promise<void> {
  const plans = [
    { name: "Basic", slug: "basic", description: "Movies and eBooks on one screen.", price: 499, maxDevices: 1, streams: 1, quality: "720p" as const, audiobooks: false, order: 1, features: ["Unlimited movies & eBooks", "1 screen at a time", "HD (720p) streaming", "Cancel anytime"] },
    { name: "Standard", slug: "standard", description: "Everything, on two screens.", price: 999, maxDevices: 3, streams: 2, quality: "1080p" as const, audiobooks: true, order: 2, features: ["Movies, eBooks & audiobooks", "2 screens at a time", "Full HD (1080p) streaming", "Download for offline", "Cancel anytime"] },
    { name: "Premium", slug: "premium", description: "The best quality for the whole family.", price: 1499, maxDevices: 5, streams: 4, quality: "4K" as const, audiobooks: true, order: 3, features: ["Movies, eBooks & audiobooks", "4 screens at a time", "Ultra HD (4K) streaming", "Download for offline", "7-day free trial"] },
  ];
  for (const p of plans) {
    if (await prisma.plan.findUnique({ where: { slug: p.slug } })) { log(`  = plan exists: ${p.name}`); continue; }
    await createPlan({
      name: p.name, slug: p.slug, description: p.description, stripePriceId: `price_demo_${p.slug}`, priceAmount: p.price, currency: "usd", billingInterval: "MONTHLY",
      trialDays: p.slug === "premium" ? 7 : undefined, maxDevices: p.maxDevices, maxConcurrentStreams: p.streams, maxVideoQuality: p.quality,
      moviesEnabled: true, ebooksEnabled: true, audiobooksEnabled: p.audiobooks, features: p.features, active: true, displayOrder: p.order,
    } as never, ctx);
    log(`  + plan: ${p.name} ($${(p.price / 100).toFixed(2)}/mo, placeholder Stripe price)`);
  }
}

async function main() {
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (!adminUser) throw new Error("No ADMIN user found — create one first (scripts/createAdmin.ts).");
  admin = adminUser;
  ctx = { userId: admin.id, ip: undefined, userAgent: "seedDemo", requestId: "seed-demo" };

  const en = await prisma.language.findUnique({ where: { code: "en" } });
  if (!en) throw new Error("Languages are missing — run the base seed first (npm run prisma:seed).");
  languageId = en.id;
  genreIds = new Map((await prisma.genre.findMany({ select: { id: true, name: true } })).map((g) => [g.name, g.id]));

  const host = (process.env["DATABASE_URL"] ?? "").replace(/^.*@/, "").replace(/[/?].*$/, "");
  log(`Seeding demo catalog into ${host} (storage: ${process.env["STORAGE_PROVIDER"] ?? "?"}/${process.env["AWS_BUCKET"] ?? "local"})`);

  registerVideoWorker();
  registerAudioWorker();

  log("Generating sample video, audio and artwork…");
  ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "8", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(tmp, "sample.mp4")]);
  sampleVideo = readFileSync(path.join(tmp, "sample.mp4"));
  try {
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100", "-t", "20", "-c:a", "libmp3lame", "-q:a", "6", path.join(tmp, "sample.mp3")]);
    sampleAudio = { data: readFileSync(path.join(tmp, "sample.mp3")), mime: "audio/mpeg", ext: "mp3" };
  } catch {
    ffmpeg(["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=22050", "-t", "20", path.join(tmp, "sample.wav")]);
    sampleAudio = { data: readFileSync(path.join(tmp, "sample.wav")), mime: "audio/wav", ext: "wav" };
  }

  log("Movies"); const movies = await seedMovies();
  log("eBooks"); const ebooks = await seedEbooks();
  log("Audiobooks"); const audiobooks = await seedAudiobooks();
  log("Collections"); const collections = await seedCollections(movies, ebooks, audiobooks);
  log("Banners"); await seedBanners(movies, ebooks, audiobooks);
  log("Homepage sections"); await seedHomepage(movies, ebooks, audiobooks, collections);
  log("Subscription plans"); await seedPlans();
  log("Done.");
}

main()
  .catch((e) => { console.error("SEED FAILED:", e instanceof Error ? e.stack ?? e.message : e); process.exitCode = 1; })
  .finally(async () => { rmSync(tmp, { recursive: true, force: true }); await prisma.$disconnect(); process.exit(process.exitCode ?? 0); });
