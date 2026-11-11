/**
 * Launch-blocker hardening: playback-session ownership answers, free-account stream/device caps, the Stripe webhook's own
 * rate limit, server-side cleaning of legal-page HTML, and range-based eBook validation.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { startPlaybackSession } from "../../src/services/playbackSession.service";
import { sanitizeLegalHtml } from "../../src/utils/legalHtml";
import { validateEpub, validateEpubRanges } from "../../src/services/media/epubValidator";
import { validatePdf, validatePdfRanges } from "../../src/services/media/pdfValidator";
import { createAdmin, createUser } from "../helpers/adminAuth";
import { ensureDocument } from "../../src/services/legal.service";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();
beforeEach(() => db.__reset());

async function makeUser() {
  const { accessToken, userId } = await createUser(app);
  return { headers: { Authorization: `Bearer ${accessToken}` }, userId };
}

describe("playback session ownership", () => {
  it("heartbeat/end on another account's session is a 404 and changes nothing; the owner's own calls work", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const { sessionId } = await startPlaybackSession(a.userId, "content-1", "MOVIE");
    expect((await request(app).post(`/api/v1/me/playback-sessions/${sessionId}/heartbeat`).set(b.headers)).status).toBe(404);
    expect((await request(app).post(`/api/v1/me/playback-sessions/${sessionId}/end`).set(b.headers)).status).toBe(404);
    expect((await request(app).post(`/api/v1/me/playback-sessions/does-not-exist/heartbeat`).set(a.headers)).status).toBe(404);
    // still the owner's active session
    expect((await request(app).post(`/api/v1/me/playback-sessions/${sessionId}/heartbeat`).set(a.headers)).status).toBe(200);
    expect((await request(app).post(`/api/v1/me/playback-sessions/${sessionId}/end`).set(a.headers)).status).toBe(200);
    // ending twice is fine; a heartbeat on an ended session is not
    expect((await request(app).post(`/api/v1/me/playback-sessions/${sessionId}/end`).set(a.headers)).status).toBe(200);
    expect((await request(app).post(`/api/v1/me/playback-sessions/${sessionId}/heartbeat`).set(a.headers)).status).toBe(404);
  });
});

describe("accounts with no plan (free titles)", () => {
  it("can play, but not run more than the free stream cap at once", async () => {
    const a = await makeUser();
    for (const c of ["c1", "c2", "c3", "c4"]) await startPlaybackSession(a.userId, c, "MOVIE");
    await expect(startPlaybackSession(a.userId, "c5", "MOVIE")).rejects.toMatchObject({ statusCode: 403, code: "CONCURRENT_STREAM_LIMIT_REACHED" });
    // eBooks do not take a stream slot
    await expect(startPlaybackSession(a.userId, "b1", "EBOOK")).resolves.toHaveProperty("sessionId");
  });

  it("devices are not capped without a plan (a new browser must never lock a free customer out); the same browser reuses its row", async () => {
    const a = await makeUser();
    for (let i = 0; i < 8; i++) expect((await request(app).post("/api/v1/me/devices/register").set(a.headers).send({ deviceIdentifier: `dev-${i}` })).status).toBe(200);
    expect((await request(app).post("/api/v1/me/devices/register").set(a.headers).send({ deviceIdentifier: "dev-0" })).status).toBe(200);
    expect((await request(app).get("/api/v1/me/devices").set(a.headers)).body.data).toHaveLength(8);
  });
});

describe("Stripe webhook rate limit", () => {
  it("is not counted against the general per-address limit (signature still required)", async () => {
    const limited = createApp({ limiter: (_req, res) => void res.status(429).json({ success: false }) });
    const res = await request(limited).post("/api/v1/webhooks/stripe").set("Content-Type", "application/json").send("{}");
    expect(res.status).toBe(400); // reached the webhook (missing signature), not the general 429
    expect((await request(limited).get("/api/v1/plans")).status).toBe(429);
  });
});

describe("legal page HTML is cleaned on the server", () => {
  it("removes scripts, handlers, embeds and javascript: links, and keeps the editor's formatting", () => {
    const dirty = [
      "<h2>Terms</h2><p>Hello <strong>bold</strong> <em>it</em> <u>u</u></p>",
      "<ul><li>one</li></ul><ol><li>two</li></ol><blockquote>q</blockquote>",
      "<table><tbody><tr><th>A</th><td>B</td></tr></tbody></table>",
      '<a href="https://example.com" target="_blank">ok</a>',
      "<script>alert(1)</script>",
      '<img src=x onerror="alert(1)">',
      '<p onclick="alert(1)" style="color:red">p</p>',
      '<a href="javascript:alert(1)">bad</a>',
      '<iframe src="https://evil.example"></iframe><form action="x"><input></form><svg onload="alert(1)"></svg>',
    ].join("");
    const clean = sanitizeLegalHtml(dirty);
    for (const kept of ["<h2>Terms</h2>", "<strong>bold</strong>", "<em>it</em>", "<li>one</li>", "<blockquote>q</blockquote>", "<th>A</th>", "<td>B</td>"]) expect(clean).toContain(kept);
    expect(clean).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>');
    expect(clean).not.toMatch(/<script|onerror|onclick|onload|javascript:|<iframe|<form|<input|<svg|<img|style=/i);
    expect(clean).toContain("<p>p</p>");
  });

  it("is applied when an admin saves a draft (stored content is already clean)", async () => {
    await ensureDocument("PRIVACY_POLICY");
    const { accessToken } = await createAdmin(app, prisma as never);
    const res = await request(app)
      .post("/api/v1/admin/legal/PRIVACY_POLICY/draft")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Privacy", content: '<p>Fine</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>', version: "9.9" });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe("<p>Fine</p><a>x</a>");
  });
});

/** A minimal valid EPUB-shaped zip: one stored entry (META-INF/container.xml) and its central directory. */
function tinyEpub(extraName?: string): Buffer {
  const name = Buffer.from(extraName ?? "META-INF/container.xml");
  const data = Buffer.from("<container/>");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const localPart = Buffer.concat([local, name, data]);
  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0);
  cdh.writeUInt32LE(data.length, 20);
  cdh.writeUInt32LE(data.length, 24);
  cdh.writeUInt16LE(name.length, 28);
  const cd = Buffer.concat([cdh, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, cd, eocd]);
}

async function* once(buf: Buffer) {
  yield buf;
}

describe("eBook validation reads only what it needs", () => {
  const ranged = (buf: Buffer) => {
    const reads: [number, number][] = [];
    const read = async (start: number, end: number) => {
      reads.push([start, end]);
      return buf.subarray(start, end + 1);
    };
    return { reads, read };
  };

  it("EPUB: same answers as the in-memory check, from small byte ranges only", async () => {
    // pad with a large first entry so the file is much bigger than what is read
    const epub = Buffer.concat([tinyEpub()]);
    const { reads, read } = ranged(epub);
    expect(await validateEpubRanges(epub.length, read)).toEqual(validateEpub(epub));
    expect((await validateEpubRanges(epub.length, read)).valid).toBe(true);
    expect(reads.every(([s, e]) => e - s + 1 <= 65557)).toBe(true);

    const notEpub = tinyEpub("chapter1.xhtml");
    expect((await validateEpubRanges(notEpub.length, ranged(notEpub).read)).reason).toMatch(/container\.xml/);
    const traversal = tinyEpub("../evil.txt");
    expect((await validateEpubRanges(traversal.length, ranged(traversal).read)).reason).toMatch(/Unsafe entry path/);
    const garbage = Buffer.from("this is not a zip at all, just text....");
    expect((await validateEpubRanges(garbage.length, ranged(garbage).read)).valid).toBe(false);
  });

  it("PDF: header/trailer from byte ranges, page count streamed in chunks (markers split across chunks still count)", async () => {
    const body = "%PDF-1.7\n" + Array.from({ length: 30 }, (_, i) => `${i} 0 obj << /Type /Page >> endobj\n`).join("") + "1 0 obj << /Type /Pages >> endobj\ntrailer\n%%EOF\n";
    const pdf = Buffer.from(body, "latin1");
    const chunks = async function* () {
      for (let i = 0; i < pdf.length; i += 7) yield pdf.subarray(i, i + 7); // tiny chunks: markers are split everywhere
    };
    const { read } = ranged(pdf);
    const result = await validatePdfRanges(pdf.length, read, async () => chunks());
    expect(result).toEqual({ valid: true, detectedPageCount: 30 });
    expect(result).toEqual(validatePdf(pdf));

    const noEof = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\n", "latin1");
    expect((await validatePdfRanges(noEof.length, ranged(noEof).read, async () => once(noEof))).reason).toMatch(/%%EOF/);
    const notPdf = Buffer.from("<html>not a pdf</html>\n%%EOF", "latin1");
    expect((await validatePdfRanges(notPdf.length, ranged(notPdf).read, async () => once(notPdf))).reason).toMatch(/%PDF-/);
  });
});

describe("admin Users list is paged, searched and sorted by the server", () => {
  it("returns only the requested page with the real total, honours search/sort, and refuses unknown sorts", async () => {
    const { accessToken } = await createAdmin(app, prisma as never);
    const H = { Authorization: `Bearer ${accessToken}` };
    for (const n of ["carol", "alice", "bob", "dave", "erin"]) await request(app).post("/api/v1/auth/register").send({ email: `${n}@example.com`, password: "a-strong-passphrase", fullName: n });
    const page1 = await request(app).get("/api/v1/admin/users?page=1&limit=2&sort=email&role=USER").set(H);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination.total).toBe(5);
    expect(page1.body.data.map((u: { email: string }) => u.email)).toEqual(["alice@example.com", "bob@example.com"]);
    const page2 = await request(app).get("/api/v1/admin/users?page=2&limit=2&sort=email&role=USER").set(H);
    expect(page2.body.data.map((u: { email: string }) => u.email)).toEqual(["carol@example.com", "dave@example.com"]);
    const found = await request(app).get("/api/v1/admin/users?search=erin").set(H);
    expect(found.body.data.map((u: { email: string }) => u.email)).toEqual(["erin@example.com"]);
    expect((await request(app).get("/api/v1/admin/users?sort=passwordHash").set(H)).status).toBe(400);
    expect((await request(app).get(`/api/v1/admin/users?search=${"x".repeat(101)}`).set(H)).status).toBe(400);
  });
});
