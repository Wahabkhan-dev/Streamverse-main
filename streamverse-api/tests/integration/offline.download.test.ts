/**
 * Offline downloads: the entitlement check lists exactly the files a title consists of, the files stream through the API
 * only with a valid token for THAT title, and nothing outside the title can be fetched.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/database", async () => {
  const { createFakePrisma } = await import("../fakePrisma.js");
  return { prisma: createFakePrisma(), disconnectDatabase: async () => undefined };
});

import { createApp } from "../../src/app";
import { prisma } from "../../src/config/database";
import { pickVariant, playlistFiles, signOfflineToken } from "../../src/services/offline/offline.service";
import { getStorageProvider } from "../../src/services/storage";
import { createUser } from "../helpers/adminAuth";
import { makePublishedAudiobook, makePublishedEbook, makePublishedMovie } from "../helpers/publishedContent";

type Db = {
  __reset: () => void;
  movie: { update: (a: unknown) => Promise<unknown> };
  ebook: { update: (a: unknown) => Promise<unknown> };
  audiobook: { update: (a: unknown) => Promise<unknown> };
  audiobookChapter: { create: (a: unknown) => Promise<{ id: string }> };
  mediaAsset: { create: (a: unknown) => Promise<{ id: string }> };
};
const db = prisma as unknown as Db;
const app = createApp();
beforeEach(() => db.__reset());

async function user() {
  const { accessToken, user } = (await createUser(app)) as { accessToken: string; user?: { id: string } };
  return { headers: { Authorization: `Bearer ${accessToken}` }, userId: user?.id ?? "" };
}
const asset = (type: string, contentId: string, extra: Record<string, unknown>) => db.mediaAsset.create({ data: { type, contentId, status: "READY", ...extra } });
const put = (key: string, text: string, mime = "application/octet-stream") => getStorageProvider().putObject(key, Buffer.from(text), mime);

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
t1080/t1080.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
t720/t720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
t480/t480.m3u8
`;
const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg_000.ts
#EXTINF:6.0,
seg_001.ts
#EXT-X-ENDLIST
`;

describe("pure helpers", () => {
  it("picks the best rendition that is not taller than 720p", () => {
    expect(pickVariant(MASTER)).toEqual({ uri: "t720/t720.m3u8", height: 720 });
  });
  it("falls back to the lightest rendition when every one is taller", () => {
    const tall = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=3840x2160\nuhd.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nfhd.m3u8\n";
    expect(pickVariant(tall)?.uri).toBe("fhd.m3u8");
  });
  it("lists segments and init maps, nothing else", () => {
    expect(playlistFiles(`${MEDIA}#EXT-X-MAP:URI="init.mp4"\n`).sort()).toEqual(["init.mp4", "seg_000.ts", "seg_001.ts"]);
  });
});

describe("movie download", () => {
  async function movie() {
    const { content } = await makePublishedMovie();
    const root = `hls/${content.id}`;
    const master = await asset("MOVIE_MASTER", content.id, { hlsManifestKey: `${root}/master.m3u8` });
    await db.movie.update({ where: { contentId: content.id }, data: { masterAssetId: master.id } });
    await put(`${root}/master.m3u8`, MASTER);
    await put(`${root}/t720/t720.m3u8`, MEDIA);
    await put(`${root}/t720/seg_000.ts`, "SEGMENT-ZERO");
    await put(`${root}/t720/seg_001.ts`, "SEGMENT-ONE");
    await put(`${root}/t1080/seg_000.ts`, "NOT-DOWNLOADED-BUT-ALLOWED-PATH");
    return content;
  }

  it("lists the 720p playlist and its segments, with a token and an expiry", async () => {
    const content = await movie();
    const { headers } = await user();
    const res = await request(app).post(`/api/v1/media/offline/${content.id}/authorize`).set(headers);
    expect(res.status).toBe(200);
    const d = res.body.data.download;
    expect(d.type).toBe("MOVIE");
    expect(d.playlist.text).toBe(MEDIA);
    expect(d.files.filter((f: { role: string }) => f.role === "segment").map((f: { id: string; name: string }) => [f.id, f.name])).toEqual([
      ["h:t720/seg_000.ts", "seg_000.ts"],
      ["h:t720/seg_001.ts", "seg_001.ts"],
    ]);
    expect(Date.parse(d.expiresAt)).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey/i);
  });

  it("streams a segment with the token, refuses a missing/foreign token and any path outside the title", async () => {
    const content = await movie();
    const other = await makePublishedMovie({ title: "Other" });
    const { headers, userId } = await user();
    const { download } = (await request(app).post(`/api/v1/media/offline/${content.id}/authorize`).set(headers)).body.data;
    const url = (f: string, t = download.token) => `/api/v1/media/offline-file/${content.id}?f=${encodeURIComponent(f)}&t=${encodeURIComponent(t)}`;

    const ok = await request(app).get(url("h:t720/seg_001.ts")).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toContain("video/mp2t");
    expect((ok.body as Buffer).toString()).toBe("SEGMENT-ONE");

    expect((await request(app).get(`/api/v1/media/offline-file/${content.id}?f=h:t720/seg_000.ts`)).status).toBe(400); // no token at all
    expect((await request(app).get(url("h:t720/seg_000.ts", signOfflineToken(userId, other.content.id)))).status).toBe(401); // token for another title
    expect((await request(app).get(url("h:t720/seg_000.ts", "garbage"))).status).toBe(401);
    expect((await request(app).get(url("h:../../secrets.txt"))).status).toBe(400); // traversal
    expect((await request(app).get(url("h:t720/t720.m3u8"))).status).toBe(400); // playlists come from the authorize response
    expect((await request(app).get(url("a:not-an-asset-of-this-title"))).status).toBe(404);
  });

  it("is not available without a session or when the movie is not ready", async () => {
    const content = await movie();
    expect((await request(app).post(`/api/v1/media/offline/${content.id}/authorize`)).status).toBe(401);
    const notReady = await makePublishedMovie({ title: "Unprocessed" });
    const res = await request(app).post(`/api/v1/media/offline/${notReady.content.id}/authorize`).set((await user()).headers);
    expect(res.body.data.mediaReady).toBe(false);
    expect(res.body.data.download).toBeNull();
  });
});

describe("eBook and audiobook downloads", () => {
  it("an eBook download is its epub (plus cover) and nothing else can be fetched with that token", async () => {
    const { content } = await makePublishedEbook();
    const epub = await asset("EBOOK_EPUB", content.id, { storageKey: `ebooks/${content.id}/book.epub`, mimeType: "application/epub+zip", sizeBytes: 9 });
    const stranger = await asset("EBOOK_PDF", "someone-else", { storageKey: "ebooks/other/secret.pdf", mimeType: "application/pdf" });
    await db.ebook.update({ where: { contentId: content.id }, data: { epubAssetId: epub.id } });
    await put(`ebooks/${content.id}/book.epub`, "EPUB-BYTES", "application/epub+zip");
    await put("ebooks/other/secret.pdf", "PRIVATE");

    const { headers } = await user();
    const { download } = (await request(app).post(`/api/v1/media/offline/${content.id}/authorize`).set(headers)).body.data;
    expect(download.type).toBe("EBOOK");
    const file = download.files.find((f: { role: string }) => f.role === "ebook");
    expect(file).toMatchObject({ name: "book.epub", mime: "application/epub+zip" });

    const get = (id: string) => request(app).get(`/api/v1/media/offline-file/${content.id}?f=${encodeURIComponent(id)}&t=${encodeURIComponent(download.token)}`);
    expect((await get(file.id)).status).toBe(200);
    expect((await get(`a:${stranger.id}`)).status).toBe(404);
  });

  it("an audiobook download lists every ready chapter in order", async () => {
    const { content, audiobook } = await makePublishedAudiobook();
    await db.audiobook.update({ where: { contentId: content.id }, data: { deliveryMode: "CHAPTER_FILES" } });
    for (const n of [2, 1]) {
      const a = await asset("AUDIOBOOK_CHAPTER", content.id, { storageKey: `audio/${content.id}/c${n}.mp3`, mimeType: "audio/mpeg" });
      await db.audiobookChapter.create({ data: { audiobookId: audiobook.contentId ?? content.id, contentId: content.id, chapterNumber: n, title: `Chapter ${n}`, audioAssetId: a.id } });
      await put(`audio/${content.id}/c${n}.mp3`, `AUDIO-${n}`);
    }
    const { headers } = await user();
    const res = await request(app).post(`/api/v1/media/offline/${content.id}/authorize`).set(headers);
    const chapters = res.body.data.download.files.filter((f: { role: string }) => f.role === "chapter");
    expect(chapters.map((c: { chapterNumber: number; chapterTitle: string }) => [c.chapterNumber, c.chapterTitle])).toEqual([
      [1, "Chapter 1"],
      [2, "Chapter 2"],
    ]);
  });
});

describe("renewal", () => {
  it("an entitled customer gets a fresh expiry; an unknown title is a 404", async () => {
    const { content } = await makePublishedEbook();
    const epub = await asset("EBOOK_EPUB", content.id, { storageKey: `ebooks/${content.id}/b.epub` });
    await db.ebook.update({ where: { contentId: content.id }, data: { epubAssetId: epub.id } });
    const { headers } = await user();
    const res = await request(app).post(`/api/v1/media/offline/${content.id}/renew`).set(headers);
    expect(res.body.data.entitled).toBe(true);
    expect(Date.parse(res.body.data.expiresAt)).toBeGreaterThan(Date.now());
    expect((await request(app).post(`/api/v1/media/offline/nope/renew`).set(headers)).status).toBe(404);
  });
});
