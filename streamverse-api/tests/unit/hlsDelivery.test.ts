import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { assertSafeRelativePath, capMasterPlaylist, heightCapOf, rewritePlaylist, signHlsToken, verifyHlsToken, type RewriteContext } from "../../src/services/media/hlsDelivery.service";

const ctx = (playlistDir = ""): RewriteContext => ({
  playlistDir,
  hlsRoot: "content/c1/hls",
  playlistUrl: (rel) => `https://api.test/media/hls/c1/${rel}?t=TOKEN`,
  signSegment: async (key) => `https://r2.test/${key}?sig=1`,
});

describe("HLS playlist rewriting", () => {
  it("points variant playlists at the API and signs segments individually", async () => {
    const master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480\n480p/480p.m3u8\n";
    expect(await rewritePlaylist(master, ctx())).toBe("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480\nhttps://api.test/media/hls/c1/480p/480p.m3u8?t=TOKEN\n");

    const variant = "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nseg_000.ts\n#EXTINF:4.0,\nseg_001.ts\n#EXT-X-ENDLIST";
    const out = (await rewritePlaylist(variant, ctx("480p"))).split("\n");
    expect(out[3]).toBe("https://r2.test/content/c1/hls/480p/seg_000.ts?sig=1");
    expect(out[5]).toBe("https://r2.test/content/c1/hls/480p/seg_001.ts?sig=1");
    expect(out[6]).toBe("#EXT-X-ENDLIST");
  });

  it("rewrites URI attributes on key / init-map tags", async () => {
    const text = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x1\n#EXT-X-MAP:URI="init.mp4"\n';
    const out = await rewritePlaylist(text, ctx("720p"));
    expect(out).toContain('URI="https://r2.test/content/c1/hls/720p/key.bin?sig=1"');
    expect(out).toContain('URI="https://r2.test/content/c1/hls/720p/init.mp4?sig=1"');
    expect(out).toContain("METHOD=AES-128");
  });

  it("refuses absolute URLs and anything that escapes the hls folder", async () => {
    await expect(rewritePlaylist("#EXTM3U\nhttps://evil.example/x.ts", ctx())).rejects.toThrow();
    await expect(rewritePlaylist("#EXTM3U\n//evil.example/x.ts", ctx())).rejects.toThrow();
    await expect(rewritePlaylist("#EXTM3U\n../../other/secret.mp4", ctx("480p"))).rejects.toThrow();
  });
});

describe("HLS path safety", () => {
  it.each(["../x.m3u8", "a/../../b.m3u8", "/etc/passwd", "a b.m3u8", "a\\b.m3u8", ""])("rejects %j", (p) => {
    expect(() => assertSafeRelativePath(p)).toThrow();
  });
  it.each(["480p/480p.m3u8", "master.m3u8", "480p/seg_000.ts"])("accepts %j", (p) => {
    expect(assertSafeRelativePath(p)).toBe(p);
  });
});

describe("HLS playback token", () => {
  it("round-trips for the same content and is refused for other content", () => {
    const { token } = signHlsToken("user-1", "content-1");
    expect(verifyHlsToken(token, "content-1").sub).toBe("user-1");
    expect(() => verifyHlsToken(token, "content-2")).toThrow();
  });

  it("rejects missing, garbage, expired and wrongly-signed tokens", () => {
    expect(() => verifyHlsToken(undefined, "c")).toThrow();
    expect(() => verifyHlsToken("garbage", "c")).toThrow();
    const expired = jwt.sign({ sub: "u", cid: "c", use: "hls" }, "some-other-secret", { expiresIn: -10 });
    expect(() => verifyHlsToken(expired, "c")).toThrow();
  });

  it("cannot be forged with the access-token secret", () => {
    const forged = jwt.sign({ sub: "u", cid: "c", use: "hls" }, process.env["JWT_SECRET"]!, { expiresIn: 600 });
    expect(() => verifyHlsToken(forged, "c")).toThrow();
  });
});

describe("Plan video-quality limit", () => {
  const master = [
    "#EXTM3U",
    "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360",
    "360p/360p.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720",
    "720p/720p.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
    "1080p/1080p.m3u8",
  ].join("\n");

  it("maps the plan's quality label to a picture height (null = no limit)", () => {
    expect(heightCapOf("480p")).toBe(480);
    expect(heightCapOf("720p")).toBe(720);
    expect(heightCapOf("1080p")).toBe(1080);
    expect(heightCapOf("4K")).toBe(2160);
    expect(heightCapOf(null)).toBeNull();
    expect(heightCapOf(undefined)).toBeNull();
  });

  it("a 720p plan's master playlist lists only the variants up to 720p", () => {
    const { text, allowed } = capMasterPlaylist(master, 720);
    expect(text).toContain("360p/360p.m3u8");
    expect(text).toContain("720p/720p.m3u8");
    expect(text).not.toContain("1080p");
    expect(text).not.toContain("1920x1080");
    expect([...allowed.dirs].sort()).toEqual(["360p", "720p"]);
  });

  it("a variant above the cap is not in the allowed list, so it cannot be fetched by guessing its path", () => {
    const { allowed } = capMasterPlaylist(master, 720);
    expect(allowed.paths.has("1080p/1080p.m3u8")).toBe(false);
    expect(allowed.paths.has("720p/720p.m3u8")).toBe(true);
    expect(allowed.dirs.has("1080p")).toBe(false);
  });

  it("an unlimited-size cap keeps every variant", () => {
    expect(capMasterPlaylist(master, 2160).text).toBe(master);
  });

  it("if every variant is taller than the cap, the lowest stays so playback still works", () => {
    const { text, allowed } = capMasterPlaylist(master, 240);
    expect(text).toContain("360p/360p.m3u8");
    expect(text).not.toContain("720p");
    expect([...allowed.dirs]).toEqual(["360p"]);
  });
});
