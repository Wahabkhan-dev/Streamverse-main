import { createHash } from "node:crypto";
import { storageReadError } from "../storage/storageErrors";
import { posix } from "node:path";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import * as mediaAccessRepository from "../../repositories/mediaAccess.repository";
import * as subscriptionRepository from "../../repositories/subscription.repository";
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../../utils/errors";
import { isCustomerVisible } from "../contentAccess.service";
import { getStorageProvider } from "../storage";
import { analyticsCache } from "../../utils/analyticsCache";

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

/* ---------------------------------------------------------------- plan video-quality limit */

/** The plan's `maxVideoQuality` in pixels of picture height. null = no limit. */
const QUALITY_HEIGHT: Record<string, number> = { "480p": 480, "720p": 720, "1080p": 1080, "4K": 2160 };
export const heightCapOf = (quality: string | null | undefined): number | null => (quality ? (QUALITY_HEIGHT[quality] ?? null) : null);

/**
 * Keeps only the variants of an HLS master playlist the plan may watch (picture height <= cap). If every variant is taller than
 * the cap, the lowest one is kept so playback still works. `allowed` lists the variant playlists (and their folders) that remain,
 * so a viewer cannot fetch a taller variant by guessing its path.
 */
export function capMasterPlaylist(text: string, cap: number): { text: string; allowed: { paths: Set<string>; dirs: Set<string> } } {
  const lines = text.split(/\r?\n/);
  const variants: { at: number; uriAt: number; height: number; uri: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const height = Number(/RESOLUTION=\d+x(\d+)/i.exec(line)?.[1]);
    let j = i + 1;
    while (j < lines.length && (!lines[j]!.trim() || lines[j]!.trim().startsWith("#"))) j++;
    if (j < lines.length && Number.isFinite(height)) variants.push({ at: i, uriAt: j, height, uri: lines[j]!.trim() });
  }
  let keep = variants.filter((v) => v.height <= cap);
  if (keep.length === 0 && variants.length > 0) keep = [variants.reduce((lowest, v) => (v.height < lowest.height ? v : lowest))];
  const kept = new Set(keep);
  const drop = new Set<number>();
  for (const v of variants) if (!kept.has(v)) (drop.add(v.at), drop.add(v.uriAt));
  const paths = new Set<string>();
  const dirs = new Set<string>();
  for (const v of keep) {
    const path = posix.normalize(v.uri.split("?")[0]!);
    paths.add(path);
    const dir = posix.dirname(path);
    if (dir !== ".") dirs.add(dir.split("/")[0]!);
  }
  return { text: lines.filter((_, i) => !drop.has(i)).join("\n"), allowed: { paths, dirs } };
}

const isAllowedByCap = (rel: string, allowed: { paths: Set<string>; dirs: Set<string> }) => allowed.paths.has(rel) || allowed.dirs.has(rel.split("/")[0]!);

/** The customer's current plan decides the picture height, read live so an admin's change applies to a stream already running. */
async function qualityCapFor(userId: string): Promise<number | null> {
  const sub = await subscriptionRepository.findByUserId(userId);
  return heightCapOf(sub?.plan?.maxVideoQuality);
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

/** The playlist files never change once processing finished; re-processing bumps the asset's updatedAt, so a new key is used. */
const PLAYLIST_CACHE_SECONDS = 60 * 60;

/**
 * Every request is authorised from scratch (token, title still visible and READY, the viewer's plan quality limit, read live) —
 * those two database reads run together. Only the playlist FILE text, identical for every viewer, comes from the cache.
 */
async function loadAuthorizedHls(contentId: string, token: string | undefined) {
  const { sub: userId } = verifyHlsToken(token, contentId);
  const [row, cap] = await Promise.all([mediaAccessRepository.findMovieForHls(contentId), qualityCapFor(userId)]);
  const asset = row?.masterAsset;
  const key = asset?.hlsManifestKey;
  // Unpublished / archived / deleted titles stop streaming immediately, even with an unexpired token.
  if (!row || !asset || !isCustomerVisible(row.content) || asset.status !== "READY" || !key) throw new NotFoundError("Movie not found");
  const hlsRoot = posix.dirname(key);
  const read = (name: string): Promise<string> =>
    analyticsCache.getOrSet(
      `media:playlist:${asset.id}:${asset.updatedAt.getTime()}:${name}`,
      () =>
        getStorageProvider()
          .getObjectRange(posix.join(hlsRoot, name), 0, MAX_PLAYLIST_BYTES - 1)
          .then((buf) => buf.toString("utf8"))
          .catch((err: unknown) => {
            throw storageReadError(err, "Playlist not found");
          }),
      PLAYLIST_CACHE_SECONDS,
    );
  return { hlsRoot, manifestName: posix.basename(key), cap, read };
}

export async function getHlsPlaylist(contentId: string, relPath: string, token: string | undefined, apiBase: string): Promise<string> {
  const { hlsRoot, manifestName, cap, read } = await loadAuthorizedHls(contentId, token);
  const rel = relPath === "" || relPath === "master.m3u8" ? manifestName : assertSafeRelativePath(relPath);
  if (!isPlaylist(rel)) throw new ValidationError([{ path: "path", message: "Not a playlist." }]);

  const storage = getStorageProvider();
  let text: string;
  if (cap === null) {
    text = await read(rel);
  } else {
    // the plan limits picture quality: the master only lists the variants it allows, and a variant outside that list is refused
    const { text: masterText, allowed } = capMasterPlaylist(await read(manifestName), cap);
    if (rel === manifestName) text = masterText;
    else if (isAllowedByCap(rel, allowed)) text = await read(rel);
    else throw new ForbiddenError("Your plan doesn't include this video quality.");
  }
  return rewritePlaylist(text, {
    playlistDir: posix.dirname(rel) === "." ? "" : posix.dirname(rel),
    hlsRoot,
    playlistUrl: (relative) => `${apiBase}/media/hls/${contentId}/${relative}?t=${encodeURIComponent(token!)}`,
    signSegment: (key) => storage.createDownloadUrl(key, env.HLS_SEGMENT_URL_TTL_SECONDS),
  });
}

export async function getHlsSegmentRedirect(contentId: string, relPath: string, token: string | undefined): Promise<string> {
  const { hlsRoot, manifestName, cap, read } = await loadAuthorizedHls(contentId, token);
  const rel = assertSafeRelativePath(relPath);
  if (cap !== null && !isAllowedByCap(rel, capMasterPlaylist(await read(manifestName), cap).allowed)) {
    throw new ForbiddenError("Your plan doesn't include this video quality.");
  }
  return getStorageProvider().createDownloadUrl(posix.join(hlsRoot, rel), env.HLS_SEGMENT_URL_TTL_SECONDS);
}
