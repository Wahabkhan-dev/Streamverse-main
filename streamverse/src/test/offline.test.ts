import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The offline answer logic: which source answers (server or the saved copy), who may use a saved copy, and what the
 * player is handed. No browser storage or network involved.
 */
const { user } = vi.hoisted(() => ({ user: { id: "u1" as string | undefined } }));
vi.mock("@/lib/authState", () => ({ getAuthUser: () => (user.id ? { id: user.id } : null) }));

import { ApiError } from "@/api/client";
import { audiobookAccess, copyOnDevice, ebookAccess, movieAccess, withLocalCopy } from "@/lib/offline/shim";
import { clearRecords, isUsable, putRecord, type DownloadRecord } from "@/lib/offline/store";

const day = 24 * 3600 * 1000;
const record = (over: Partial<DownloadRecord> = {}): DownloadRecord => ({
  contentId: "c1",
  slug: "the-title",
  type: "MOVIE",
  title: "The Title",
  userId: "u1",
  status: "ready",
  progress: 1,
  bytes: 10,
  downloadedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 5 * day).toISOString(),
  meta: { id: "c1", slug: "the-title" },
  posterUrl: null,
  playback: { kind: "movie", playlist: "index.m3u8" },
  ...over,
});

const online = (value: boolean) => Object.defineProperty(navigator, "onLine", { value, configurable: true });

beforeEach(() => {
  clearRecords();
  user.id = "u1";
  online(true);
});

describe("who may use a saved copy", () => {
  it("only the customer who downloaded it, while it is finished and not expired", () => {
    expect(isUsable(record(), "u1")).toBe(true);
    expect(isUsable(record(), "someone-else")).toBe(false);
    expect(isUsable(record(), undefined)).toBe(false);
    expect(isUsable(record({ status: "partial" }), "u1")).toBe(false);
    expect(isUsable(record({ expiresAt: new Date(Date.now() - 1000).toISOString() }), "u1")).toBe(false);
  });

  it("is found by id or slug, and not for another customer", () => {
    putRecord(record());
    expect(copyOnDevice("c1")?.title).toBe("The Title");
    expect(copyOnDevice("the-title")?.title).toBe("The Title");
    user.id = "u2";
    expect(copyOnDevice("c1")).toBeUndefined();
  });
});

describe("withLocalCopy: server first, the saved copy when the server cannot answer", () => {
  const server = vi.fn(async () => "from server");

  it("online: the server answers even when a copy exists", async () => {
    putRecord(record());
    server.mockClear();
    expect(await withLocalCopy("c1", server, () => "from device")).toBe("from server");
    expect(server).toHaveBeenCalledOnce();
  });

  it("no internet: the saved copy answers and the server is never asked", async () => {
    putRecord(record());
    online(false);
    server.mockClear();
    expect(await withLocalCopy("c1", server, () => "from device")).toBe("from device");
    expect(server).not.toHaveBeenCalled();
  });

  it("server unreachable (network failure or a gateway error): the saved copy answers", async () => {
    putRecord(record());
    expect(await withLocalCopy("c1", async () => Promise.reject(new TypeError("Failed to fetch")), () => "from device")).toBe("from device");
    expect(await withLocalCopy("c1", async () => Promise.reject(new ApiError(503, "X", "down")), () => "from device")).toBe("from device");
  });

  it("the server saying NO is never overridden by a saved copy", async () => {
    putRecord(record());
    await expect(withLocalCopy("c1", async () => Promise.reject(new ApiError(403, "NO_ACTIVE_SUBSCRIPTION", "no")), () => "from device")).rejects.toMatchObject({ code: "NO_ACTIVE_SUBSCRIPTION" });
  });

  it("an expired copy says so instead of playing", async () => {
    putRecord(record({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    online(false);
    await expect(withLocalCopy("c1", server, () => "from device")).rejects.toMatchObject({ code: "DOWNLOAD_EXPIRED" });
  });

  it("no copy: the failure is the server's (the screen then shows its own error)", async () => {
    online(false);
    await expect(withLocalCopy("nothing", async () => Promise.reject(new TypeError("Failed to fetch")), () => "from device")).rejects.toBeInstanceOf(TypeError);
  });
});

describe("what the players are handed", () => {
  it("a movie: the saved playlist on this site, not a signed link", () => {
    const res = movieAccess(record());
    expect(res.data).toMatchObject({ mediaReady: true, playback: { type: "HLS", url: "/offline-media/c1/index.m3u8" } });
  });

  it("an eBook: the saved file and its type", () => {
    const res = ebookAccess(record({ type: "EBOOK", playback: { kind: "ebook", file: "book.epub", fileType: "epub" } }));
    expect(res.data).toMatchObject({ mediaReady: true, signedUrl: "/offline-media/c1/book.epub", fileType: "epub", contentId: "c1" });
  });

  it("an audiobook: one file, or every chapter in order", () => {
    expect(audiobookAccess(record({ type: "AUDIOBOOK", playback: { kind: "audiobook-single", file: "audio.mp3" } })).data).toMatchObject({ playback: { mode: "SINGLE_FILE", url: "/offline-media/c1/audio.mp3" } });
    const chapters = audiobookAccess(record({ type: "AUDIOBOOK", playback: { kind: "audiobook-chapters", chapters: [{ chapterNumber: 1, title: "One", file: "chapter-1.mp3" }, { chapterNumber: 2, title: "Two", file: "chapter-2.mp3" }] } }));
    expect((chapters.data as { playback: { chapters: Array<{ url: string }> } }).playback.chapters.map((c) => c.url)).toEqual(["/offline-media/c1/chapter-1.mp3", "/offline-media/c1/chapter-2.mp3"]);
  });

  it("a copy of the wrong kind is refused", () => {
    expect(() => ebookAccess(record())).toThrow(/not an eBook/);
  });
});
