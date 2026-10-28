import { createHash } from "node:crypto";
import { posix } from "node:path";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import * as mediaAccessRepository from "../../repositories/mediaAccess.repository";
import { NotFoundError, UnauthorizedError, ValidationError } from "../../utils/errors";
import { isCustomerVisible } from "../contentAccess.service";
import { getStorageProvider } from "../storage";

/**
 * Private HLS delivery.
 *
 * A signed URL covers exactly ONE object, but an HLS manifest points at other objects (variant playlists, then
 * segments). Serving the raw manifest therefore yields a player that fetches the first playlist and fails on the
 * next request. Instead the player is handed a backend URL for the master playlist; every playlist we serve is
 * rewritten so that
 *   - variant playlists point back at this API (authorised by the playback token), and
 *   - media segments / keys / init maps are freshly signed, single-object R2 URLs.
 * Segment bytes still flow straight from R2 to the browser — never through this server.
 */

/** Separate signing key so an HLS token can never be replayed as an access token (and vice versa). */
const hlsSecret = () => createHash("sha256").update(`hls-playback-token:${env.JWT_SECRET}`).digest();

interface HlsTokenPayload {
  sub: string;
  cid: string;
  use: "hls";
}

export function signHlsToken(userId: string, contentId: string): { token: string; expiresAt: string } {
  const token = jwt.sign({ sub: userId, cid: contentId, use: "hls" } satisfies HlsTokenPayload, hlsSecret(), { expiresIn: env.HLS_TOKEN_TTL_SECONDS });
  return { token, expiresAt: new Date(Date.now() + env.HLS_TOKEN_TTL_SECONDS * 1000).toISOString() };
}

export function verifyHlsToken(token: string | undefined, contentId: string): HlsTokenPayload {
  if (!token) throw new UnauthorizedError("Playback authorization is missing or expired.");
  try {
    const payload = jwt.verify(token, hlsSecret()) as HlsTokenPayload;
    if (payload.use !== "hls" || payload.cid !== contentId) throw new Error("token is for different content");
    return payload;
  } catch {
    throw new UnauthorizedError("Playback authorization is missing or expired.");
  }
}

/** Only plain relative paths inside the movie's own hls/ folder are ever allowed. */
export function assertSafeRelativePath(rel: string): string {
  const normalized = posix.normalize(rel);
  if (!rel || rel.startsWith("/") || normalized.startsWith("..") || normalized.includes("/../") || !/^[A-Za-z0-9._\-/]+$/.test(rel)) {
    throw new ValidationError([{ path: "path", message: "Invalid media path." }]);
  }
  return normalized;
}

type Signer = (key: string) => Promise<string>;
export interface RewriteContext {
  /** directory of the playlist being rewritten, relative to the movie's hls/ folder ("" for the master) */
  playlistDir: string;
  /** the movie's hls/ folder as a storage key prefix, no trailing slash */
  hlsRoot: string;
  /** builds the API URL for a (relative to hls/) playlist path */
  playlistUrl: (relativePath: string) => string;
  signSegment: Signer;
}

const URI_ATTR = /URI="([^"]*)"/g;
const isPlaylist = (uri: string) => /\.m3u8(\?|$)/i.test(uri);

/** Pure (apart from signing): rewrites every URI in an HLS playlist. Exported for unit tests. */
export async function rewritePlaylist(text: string, ctx: RewriteContext): Promise<string> {
  const rewriteUri = async (uri: string): Promise<string> => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith("//")) throw new ValidationError([{ path: "playlist", message: "Absolute URLs in a playlist are not allowed." }]);
    const relative = assertSafeRelativePath(posix.normalize(posix.join(ctx.playlistDir, uri.split("?")[0]!)));
    return isPlaylist(uri) ? ctx.playlistUrl(relative) : ctx.signSegment(posix.join(ctx.hlsRoot, relative));
  };

  const lines = text.split(/\r?\n/);
  const out = await Promise.all(
    lines.map(async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        // tags carrying a URI="..." attribute (EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA, ...)
        const matches = [...trimmed.matchAll(URI_ATTR)];
        if (!matches.length) return line;
        let rewritten = trimmed;
        for (const m of matches) rewritten = rewritten.replace(m[0], `URI="${await rewriteUri(m[1]!)}"`);
        return rewritten;
      }
      return rewriteUri(trimmed);
    }),
  );
  return out.join("\n");
}

const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;

async function loadAuthorizedHls(contentId: string, token: string | undefined) {
  verifyHlsToken(token, contentId);
  const row = await mediaAccessRepository.findMovieForPlayback(contentId);
  const key = row?.masterAsset?.hlsManifestKey;
  // Unpublished / archived / deleted titles stop streaming immediately, even with an unexpired token.
  if (!row || !isCustomerVisible(row.content) || row.masterAsset?.status !== "READY" || !key) throw new NotFoundError("Movie not found");
  return { hlsRoot: posix.dirname(key), manifestName: posix.basename(key) };
}

export async function getHlsPlaylist(contentId: string, relPath: string, token: string | undefined, apiBase: string): Promise<string> {
  const { hlsRoot, manifestName } = await loadAuthorizedHls(contentId, token);
  const rel = relPath === "" || relPath === "master.m3u8" ? manifestName : assertSafeRelativePath(relPath);
  if (!isPlaylist(rel)) throw new ValidationError([{ path: "path", message: "Not a playlist." }]);

  const storage = getStorageProvider();
  const buf = await storage.getObjectRange(posix.join(hlsRoot, rel), 0, MAX_PLAYLIST_BYTES - 1).catch(() => {
    throw new NotFoundError("Playlist not found");
  });
  return rewritePlaylist(buf.toString("utf8"), {
    playlistDir: posix.dirname(rel) === "." ? "" : posix.dirname(rel),
    hlsRoot,
    playlistUrl: (relative) => `${apiBase}/media/hls/${contentId}/${relative}?t=${encodeURIComponent(token!)}`,
    signSegment: (key) => storage.createDownloadUrl(key, env.HLS_SEGMENT_URL_TTL_SECONDS),
  });
}

/** A segment requested through the API (instead of via a rewritten playlist) is redirected to a signed R2 URL. */
export async function getHlsSegmentRedirect(contentId: string, relPath: string, token: string | undefined): Promise<string> {
  const { hlsRoot } = await loadAuthorizedHls(contentId, token);
  const rel = assertSafeRelativePath(relPath);
  return getStorageProvider().createDownloadUrl(posix.join(hlsRoot, rel), env.HLS_SEGMENT_URL_TTL_SECONDS);
}
