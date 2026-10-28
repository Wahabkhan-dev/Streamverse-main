import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { Readable } from "node:stream";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import * as contentRepository from "../../repositories/content.repository";
import * as mediaAccessRepository from "../../repositories/mediaAccess.repository";
import { NotFoundError, UnauthorizedError, ValidationError } from "../../utils/errors";
import { isCustomerVisible } from "../contentAccess.service";
import { checkAccess, type AccessContext } from "../entitlement/entitlement.service";
import { assertSafeRelativePath } from "../media/hlsDelivery.service";
import { getStorageProvider } from "../storage";

/**
 * Offline downloads ("save to watch / read / listen without internet").
 *
 * The browser cannot fetch private media straight from the bucket (no CORS on it), so a download is PROXIED through the API:
 *   1. POST /me/offline/:contentId      the central entitlement check, then the list of files to fetch + a short token
 *   2. GET  /media/offline/:contentId   one file per call, authorised by that token (a plain fetch cannot rely on headers
 *                                       being kept, and the list is long for a movie)
 * What comes back is exactly what the player needs: a movie's HLS playlist and segments (one rendition, <= 720p), an
 * eBook's file, an audiobook's audio files, plus the artwork for the Downloads screen. A download expires after
 * OFFLINE_DOWNLOAD_TTL_DAYS and is renewed whenever the device is online and still entitled.
 */

export const OFFLINE_DOWNLOAD_TTL_DAYS = 30;
const MAX_DOWNLOAD_HEIGHT = 720;
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
const TOKEN_TTL_SECONDS = 2 * 60 * 60;

/* ------------------------------------------------------------------ tokens (a separate key from playback tokens) */

const secret = () => createHash("sha256").update(`offline-download-token:${env.JWT_SECRET}`).digest();

interface OfflineTokenPayload {
  sub: string;
  cid: string;
  use: "offline";
}

export function signOfflineToken(userId: string, contentId: string): string {
  return jwt.sign({ sub: userId, cid: contentId, use: "offline" } satisfies OfflineTokenPayload, secret(), { expiresIn: TOKEN_TTL_SECONDS });
}

export function verifyOfflineToken(token: string | undefined, contentId: string): OfflineTokenPayload {
  if (!token) throw new UnauthorizedError("Download authorization is missing or expired.");
  try {
    const payload = jwt.verify(token, secret()) as OfflineTokenPayload;
    if (payload.use !== "offline" || payload.cid !== contentId) throw new Error("token is for different content");
    return payload;
  } catch {
    throw new UnauthorizedError("Download authorization is missing or expired.");
  }
}

/* ------------------------------------------------------------------ HLS helpers (pure, unit-tested) */

/** The best rendition not taller than MAX_DOWNLOAD_HEIGHT (or the smallest one when all are taller). */
export function pickVariant(masterText: string): { uri: string; height: number } | null {
  const lines = masterText.split(/\r?\n/).map((l) => l.trim());
  const variants: Array<{ uri: string; height: number; bandwidth: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const uri = lines.slice(i + 1).find((l) => l && !l.startsWith("#"));
    if (!uri) continue;
    variants.push({
      uri,
      height: Number(/RESOLUTION=\d+x(\d+)/.exec(line)?.[1] ?? 0),
      bandwidth: Number(/BANDWIDTH=(\d+)/.exec(line)?.[1] ?? 0),
    });
  }
  if (!variants.length) return null;
  const fits = variants.filter((v) => v.height > 0 && v.height <= MAX_DOWNLOAD_HEIGHT).sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
  const chosen = fits[0] ?? [...variants].sort((a, b) => a.bandwidth - b.bandwidth)[0]!;
  return { uri: chosen.uri, height: chosen.height };
}

/** Every file a media playlist needs (segments, init maps, keys), relative to the playlist. */
export function playlistFiles(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      for (const m of line.matchAll(/URI="([^"]*)"/g)) out.add(m[1]!);
    } else out.add(line);
  }
  return [...out];
}

const mimeForSegment = (name: string) => (/\.m4s$|\.mp4$/i.test(name) ? "video/mp4" : /\.aac$/i.test(name) ? "audio/aac" : "video/mp2t");

/* ------------------------------------------------------------------ what a title consists of */

interface OfflineAsset {
  key: string;
  mime: string;
  bytes: number | null;
}
interface OfflineTitle {
  type: "MOVIE" | "EBOOK" | "AUDIOBOOK";
  title: string;
  /** `a:<assetId>` -> asset */
  assets: Map<string, OfflineAsset>;
  hls?: { root: string; manifestName: string };
  /** which asset ids make up the title, in order, and what each is for */
  parts: Array<{ id: string; role: "video" | "ebook" | "audio" | "chapter" | "poster"; name: string; chapterNumber?: number; chapterTitle?: string }>;
  mediaReady: boolean;
}

type Row = { id: string; storageKey: string | null; status: string; mimeType: string | null; sizeBytes: number | null } | null | undefined;

function asset(map: Map<string, OfflineAsset>, a: Row, fallbackMime: string): string | null {
  if (!a || a.status !== "READY" || !a.storageKey) return null;
  const id = `a:${a.id}`;
  map.set(id, { key: a.storageKey, mime: a.mimeType ?? fallbackMime, bytes: a.sizeBytes });
  return id;
}

async function loadTitle(contentId: string): Promise<{ title: OfflineTitle; visible: boolean }> {
  const content = await contentRepository.findById(contentId);
  if (!content) throw new NotFoundError("Title not found");
  const assets = new Map<string, OfflineAsset>();
  const parts: OfflineTitle["parts"] = [];
  const addPoster = (a: Row) => {
    const id = asset(assets, a, "image/jpeg");
    if (id) parts.push({ id, role: "poster", name: "poster" });
  };

  if (content.type === "MOVIE") {
    const row = await mediaAccessRepository.findMovieForPlayback(contentId);
    if (!row) throw new NotFoundError("Movie not found");
    const key = row.masterAsset?.hlsManifestKey;
    const ready = row.masterAsset?.status === "READY" && !!key;
    addPoster(row.posterAsset);
    return {
      visible: isCustomerVisible(row.content),
      title: { type: "MOVIE", title: row.content.title, assets, parts, mediaReady: ready, ...(ready ? { hls: { root: posix.dirname(key!), manifestName: posix.basename(key!) } } : {}) },
    };
  }
  if (content.type === "EBOOK") {
    const row = await mediaAccessRepository.findEbookForAccess(contentId);
    if (!row) throw new NotFoundError("eBook not found");
    const epub = asset(assets, row.epubAsset, "application/epub+zip");
    const pdf = epub ? null : asset(assets, row.pdfAsset, "application/pdf");
    const id = epub ?? pdf;
    if (id) parts.push({ id, role: "ebook", name: epub ? "book.epub" : "book.pdf" });
    addPoster(row.frontCoverAsset);
    return { visible: isCustomerVisible(row.content), title: { type: "EBOOK", title: row.content.title, assets, parts, mediaReady: !!id } };
  }
  const row = await mediaAccessRepository.findAudiobookForPlayback(contentId);
  if (!row) throw new NotFoundError("Audiobook not found");
  if (row.deliveryMode === "CHAPTER_FILES") {
    for (const c of row.chapters) {
      const id = asset(assets, c.audioAsset, "audio/mpeg");
      if (id) parts.push({ id, role: "chapter", name: `chapter-${c.chapterNumber}.mp3`, chapterNumber: c.chapterNumber, chapterTitle: c.title });
    }
  } else {
    const id = asset(assets, row.mainAsset, "audio/mpeg");
    if (id) parts.push({ id, role: "audio", name: "audio.mp3" });
  }
  addPoster(row.coverAsset);
  return { visible: isCustomerVisible(row.content), title: { type: "AUDIOBOOK", title: row.content.title, assets, parts, mediaReady: parts.some((p) => p.role !== "poster") } };
}

const accessType = (t: OfflineTitle["type"]) => (t === "MOVIE" ? "movie" : t === "EBOOK" ? "ebook" : "audiobook");
const expiryFromNow = () => new Date(Date.now() + OFFLINE_DOWNLOAD_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

/* ------------------------------------------------------------------ public operations */

export interface OfflineFile {
  /** what to ask the file endpoint for */
  id: string;
  /** where the browser stores it, relative to the title's folder */
  name: string;
  role: "playlist" | "segment" | "video" | "ebook" | "audio" | "chapter" | "poster";
  mime: string;
  bytes: number | null;
  chapterNumber?: number;
  chapterTitle?: string;
}

/** Entitlement check + the list of files that make up an offline copy. Nothing is granted unless the title is playable now. */
export async function authorizeDownload(contentId: string, context: AccessContext) {
  if (!context.userId) throw new UnauthorizedError("Sign in to download.");
  const { title, visible } = await loadTitle(contentId);
  const decision = await checkAccess(context, contentId, accessType(title.type));
  if (!decision.canViewMetadata || !visible) throw new NotFoundError("Title not found");
  if (!decision.canConsume || !title.mediaReady) return { access: decision, mediaReady: title.mediaReady, download: null };

  const files: OfflineFile[] = [];
  let playlist: { name: string; text: string } | null = null;

  if (title.type === "MOVIE") {
    const storage = getStorageProvider();
    const read = async (rel: string) => (await storage.getObjectRange(posix.join(title.hls!.root, rel), 0, MAX_PLAYLIST_BYTES - 1)).toString("utf8");
    const master = await read(title.hls!.manifestName).catch(() => {
      throw new NotFoundError("Movie not found");
    });
    const variant = pickVariant(master);
    if (!variant) throw new ValidationError([{ path: "contentId", message: "This movie has no downloadable version yet." }]);
    const variantPath = assertSafeRelativePath(posix.normalize(variant.uri.split("?")[0]!));
    const text = await read(variantPath);
    const dir = posix.dirname(variantPath) === "." ? "" : posix.dirname(variantPath);
    playlist = { name: "index.m3u8", text };
    for (const rel of playlistFiles(text)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(rel) || rel.startsWith("//")) throw new ValidationError([{ path: "playlist", message: "Absolute URLs in a playlist are not allowed." }]);
      const safe = assertSafeRelativePath(posix.normalize(posix.join(dir, rel.split("?")[0]!)));
      files.push({ id: `h:${safe}`, name: rel.split("?")[0]!, role: "segment", mime: mimeForSegment(rel), bytes: null });
    }
  }
  for (const p of title.parts) {
    const a = title.assets.get(p.id)!;
    files.push({
      id: p.id,
      name: p.name,
      role: p.role === "ebook" ? "ebook" : p.role,
      mime: a.mime,
      bytes: a.bytes,
      ...(p.chapterNumber !== undefined ? { chapterNumber: p.chapterNumber, chapterTitle: p.chapterTitle ?? "" } : {}),
    });
  }
  return {
    access: decision,
    mediaReady: true,
    download: { contentId, type: title.type, title: title.title, expiresAt: expiryFromNow(), token: signOfflineToken(context.userId, contentId), playlist, files },
  };
}

/** Still entitled? Then the download is good for another OFFLINE_DOWNLOAD_TTL_DAYS; if not the app deletes the copy. */
export async function renewDownload(contentId: string, context: AccessContext) {
  if (!context.userId) throw new UnauthorizedError("Sign in to renew a download.");
  const { title, visible } = await loadTitle(contentId);
  const decision = await checkAccess(context, contentId, accessType(title.type));
  const entitled = decision.canViewMetadata && decision.canConsume && visible && title.mediaReady;
  return { entitled, expiresAt: entitled ? expiryFromNow() : null };
}

/** One file of an authorised download, as a stream (path/asset checked against what this title really consists of). */
export async function openDownloadFile(contentId: string, fileId: string, token: string | undefined): Promise<{ stream: Readable; sizeBytes?: number; mime: string }> {
  verifyOfflineToken(token, contentId);
  const { title, visible } = await loadTitle(contentId);
  if (!visible || !title.mediaReady) throw new NotFoundError("Title not found");
  const storage = getStorageProvider();

  if (fileId.startsWith("h:")) {
    if (!title.hls) throw new NotFoundError("File not found");
    const rel = assertSafeRelativePath(fileId.slice(2));
    if (/\.m3u8$/i.test(rel)) throw new ValidationError([{ path: "f", message: "Playlists are not downloaded this way." }]);
    const { stream, sizeBytes } = await storage.getObjectStream(posix.join(title.hls.root, rel)).catch(() => {
      throw new NotFoundError("File not found");
    });
    return { stream, mime: mimeForSegment(rel), ...(sizeBytes !== undefined ? { sizeBytes } : {}) };
  }
  const a = title.assets.get(fileId);
  if (!a) throw new NotFoundError("File not found");
  const { stream, sizeBytes } = await storage.getObjectStream(a.key).catch(() => {
    throw new NotFoundError("File not found");
  });
  return { stream, mime: a.mime, ...(sizeBytes !== undefined ? { sizeBytes } : a.bytes ? { sizeBytes: a.bytes } : {}) };
}
