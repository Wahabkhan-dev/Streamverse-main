import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { createAdmin } from "../helpers/adminAuth";
import { makeDraftEbook, makeDraftMovie } from "../helpers/draftContent";
import { createLanguage } from "../../src/services/language.service";

const db = prisma as unknown as { __reset: () => void };
const app = createApp();

beforeEach(() => db.__reset());

async function admin() {
  const { accessToken } = await createAdmin(app, db as never);
  return { Authorization: `Bearer ${accessToken}` };
}

async function presignAndUpload(headers: Record<string, string>, body: Record<string, unknown>, bytes: Buffer, mimeType: string) {
  const presigned = await request(app).post("/api/v1/admin/uploads/presign").set(headers).send({ fileName: "file", mimeType, sizeBytes: bytes.length, ...body });
  if (presigned.status !== 201) return { presigned, completed: null };
  await request(app).put(presigned.body.data.uploadUrl).set("Content-Type", mimeType).send(bytes);
  const completed = await request(app).post(`/api/v1/admin/uploads/${presigned.body.data.assetId}/complete`).set(headers);
  return { presigned, completed };
}

function minimalEpub(): Buffer {
  // A hand-built, syntactically valid (if tiny) ZIP: one entry "META-INF/container.xml", local header +
  // central directory + EOCD — enough to pass validateEpub's structural checks.
  const name = Buffer.from("META-INF/container.xml");
  const data = Buffer.from("<xml/>");
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(name.length, 26);
  const local = Buffer.concat([localHeader, name, data]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt32LE(data.length, 24); // uncompressed size
  centralHeader.writeUInt16LE(name.length, 28);
  const central = Buffer.concat([centralHeader, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16); // central dir offset

  return Buffer.concat([local, central, eocd]);
}

function minimalPdf(): Buffer {
  return Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n%%EOF");
}

describe("eBook file validation (Section 39/40/98)", () => {
  it("accepts a structurally valid EPUB", async () => {
    const { content } = await makeDraftEbook();
    const headers = await admin();
    const { completed } = await presignAndUpload(headers, { contentId: content.id, purpose: "EBOOK_EPUB" }, minimalEpub(), "application/epub+zip");
    expect(completed!.status).toBe(200);
    expect(completed!.body.data.status).toBe("READY");
  });

  it("rejects an EPUB that isn't a valid ZIP container", async () => {
    const { content } = await makeDraftEbook();
    const headers = await admin();
    const { completed } = await presignAndUpload(headers, { contentId: content.id, purpose: "EBOOK_EPUB" }, Buffer.from("not a zip file at all"), "application/epub+zip");
    expect(completed!.status).toBe(400);
  });

  it("accepts a structurally valid PDF and rejects a fake one", async () => {
    const { content } = await makeDraftEbook();
    const headers = await admin();
    const good = await presignAndUpload(headers, { contentId: content.id, purpose: "EBOOK_PDF" }, minimalPdf(), "application/pdf");
    expect(good.completed!.status).toBe(200);

    const bad = await presignAndUpload(headers, { contentId: content.id, purpose: "EBOOK_PDF" }, Buffer.from("definitely not a pdf"), "application/pdf");
    expect(bad.completed!.status).toBe(400);
  });

  it("publish support: either EPUB or PDF alone is enough, both READY", async () => {
    const { content } = await makeDraftEbook();
    const headers = await admin();
    const { presigned } = await presignAndUpload(headers, { contentId: content.id, purpose: "EBOOK_EPUB" }, minimalEpub(), "application/epub+zip");
    const asset = await prisma.mediaAsset.findUnique({ where: { id: presigned.body.data.assetId } });
    expect(asset!.status).toBe("READY");
  });
});

describe("Caption validation (Section 36/37/99)", () => {
  it("accepts a valid VTT file with real cue timestamps", async () => {
    const { content } = await makeDraftMovie();
    const language = await createLanguage({ code: "fr", name: "French" });
    const headers = await admin();
    const vtt = Buffer.from("WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello there.\n");
    const { completed } = await presignAndUpload(headers, { contentId: content.id, purpose: "CAPTION", languageId: language.id }, vtt, "text/vtt");
    expect(completed!.status).toBe(200);
    expect(completed!.body.data.status).toBe("READY");
  });

  it("accepts a valid SRT file", async () => {
    const { content } = await makeDraftMovie();
    const language = await createLanguage({ code: "fr-ca", name: "French 2" });
    const headers = await admin();
    const srt = Buffer.from("1\n00:00:01,000 --> 00:00:04,000\nHello there.\n");
    const { completed } = await presignAndUpload(headers, { contentId: content.id, purpose: "CAPTION", languageId: language.id }, srt, "application/x-subrip");
    expect(completed!.status).toBe(200);
  });

  it("rejects a caption file with malformed/missing timestamps", async () => {
    const { content } = await makeDraftMovie();
    const language = await createLanguage({ code: "es", name: "French 3" });
    const headers = await admin();
    const bogus = Buffer.from("WEBVTT\n\nthis has no cue timestamps at all\n");
    const { completed } = await presignAndUpload(headers, { contentId: content.id, purpose: "CAPTION", languageId: language.id }, bogus, "text/vtt");
    expect(completed!.status).toBe(400);
  });

  it("rejects an empty caption file", async () => {
    const { content } = await makeDraftMovie();
    const language = await createLanguage({ code: "es-mx", name: "French 4" });
    const headers = await admin();
    const { completed } = await presignAndUpload(headers, { contentId: content.id, purpose: "CAPTION", languageId: language.id }, Buffer.from("   "), "text/vtt");
    expect(completed!.status).toBe(400);
  });

  it("requires a languageId for a caption upload", async () => {
    const { content } = await makeDraftMovie();
    const headers = await admin();
    const res = await request(app).post("/api/v1/admin/uploads/presign").set(headers).send({ contentId: content.id, purpose: "CAPTION", fileName: "x.vtt", mimeType: "text/vtt", sizeBytes: 10 });
    expect(res.status).toBe(400);
  });
});
