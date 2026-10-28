import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { assertSafeRelativePath, rewritePlaylist, signHlsToken, verifyHlsToken, type RewriteContext } from "../../src/services/media/hlsDelivery.service";

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
