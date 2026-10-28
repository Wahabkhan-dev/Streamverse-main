import { ApiError, Api, uploadAsset, waitForAssetReady } from "./api";
import { SEED_PREFIX } from "./env";

type Row = Record<string, unknown>;
export interface SeededItem {
  id: string;
  slug: string;
  title: string;
}
export interface Seed {
  movie: SeededItem;
  ebookEpub: SeededItem;
  ebookPdf: SeededItem;
  audiobook: SeededItem;
}

const JPEG = "image/jpeg";

async function lookups(admin: Api, contentType: "MOVIE" | "EBOOK" | "AUDIOBOOK") {
  const genres = (await admin.get<Row[]>("/admin/genres?limit=100")).data;
  const languages = (await admin.get<Row[]>("/admin/languages?limit=100")).data;
  const genre = genres.find((g) => g["contentType"] === contentType) ?? genres.find((g) => !g["contentType"]) ?? genres[0];
  const language = languages.find((l) => l["code"] === "en") ?? languages[0];
  if (!genre || !language) throw new Error("seed: backend has no genres/languages — run `npm run seed` in streamverse-api first");
  return { genreId: String(genre["id"]), languageId: String(language["id"]) };
}

const base = (title: string, genreId: string, languageId: string) => ({
  title,
  summary: `${title} — created by the live-mode E2E suite.`,
  description: `${title}. Real uploaded media created by the live-mode E2E suite; safe to delete.`,
  visibility: "PUBLIC",
  releaseDate: "2025-01-15",
  age: { ageRating: "13+" },
  genreIds: [genreId],
  languages: [{ languageId, role: "PRIMARY" }],
});

/** Finds an already-published seeded item by exact title, so repeated runs reuse real media instead of piling up. */
async function findPublished(admin: Api, kind: "movies" | "ebooks" | "audiobooks", title: string): Promise<SeededItem | undefined> {
  const rows = (await admin.get<Row[]>(`/admin/${kind}?search=${encodeURIComponent(title)}&limit=20`)).data;
  const hit = rows.find((r) => r["title"] === title && r["status"] === "PUBLISHED");
  return hit ? { id: String(hit["id"]), slug: String(hit["slug"]), title } : undefined;
}

async function publish(admin: Api, kind: "movies" | "ebooks" | "audiobooks", id: string) {
  try {
    await admin.post(`/admin/${kind}/${id}/publish`, {});
  } catch (e) {
    if (e instanceof ApiError) throw new Error(`publish ${kind}/${id} rejected: ${JSON.stringify(e.body)}`);
    throw e;
  }
}

async function ready(admin: Api, asset: { assetId: string }) {
  await waitForAssetReady(admin, asset.assetId);
  return asset.assetId;
}

/** Runs `build` for freshly created content; if anything throws, soft-deletes the half-built draft so failed runs leave nothing behind. */
async function cleanupOnFailure<T>(admin: Api, kind: "movies" | "ebooks" | "audiobooks", id: string, build: () => Promise<T>): Promise<T> {
  try {
    return await build();
  } catch (e) {
    await admin.del(`/admin/${kind}/${id}`, {}).catch(() => undefined);
    throw e;
  }
}

export async function createMovie(admin: Api, title: string, opts: { publishIt?: boolean } = {}): Promise<SeededItem> {
  const { genreId, languageId } = await lookups(admin, "MOVIE");
  const created = (await admin.post<Row>("/admin/movies", { ...base(title, genreId, languageId), movie: { runtimeMinutes: 1 } })).data;
  const id = String(created["id"]);
  return cleanupOnFailure(admin, "movies", id, async () => {
  const poster = await uploadAsset(admin, { contentId: id, purpose: "POSTER", file: "poster.jpg", mimeType: JPEG });
  const backdrop = await uploadAsset(admin, { contentId: id, purpose: "BACKDROP", file: "backdrop.jpg", mimeType: JPEG });
  const thumb = await uploadAsset(admin, { contentId: id, purpose: "THUMBNAIL", file: "thumb.jpg", mimeType: JPEG });
  const master = await uploadAsset(admin, { contentId: id, purpose: "MOVIE_MASTER", file: "movie.mp4", mimeType: "video/mp4" });
  const ids = {
    posterAssetId: await ready(admin, poster),
    backdropAssetId: await ready(admin, backdrop),
    thumbnailAssetId: await ready(admin, thumb),
    masterAssetId: await ready(admin, master),
  };
  await admin.put(`/admin/movies/${id}`, { movie: ids });
  if (opts.publishIt !== false) await publish(admin, "movies", id);
  return { id, slug: String(created["slug"]), title };
  });
}

export async function createEbook(admin: Api, title: string, format: "epub" | "pdf", opts: { publishIt?: boolean } = {}): Promise<SeededItem> {
  const { genreId, languageId } = await lookups(admin, "EBOOK");
  const created = (await admin.post<Row>("/admin/ebooks", { ...base(title, genreId, languageId), ebook: { author: "E2E Author", pageCount: 3 } })).data;
  const id = String(created["id"]);
  return cleanupOnFailure(admin, "ebooks", id, async () => {
  const cover = await uploadAsset(admin, { contentId: id, purpose: "EBOOK_FRONT_COVER", file: "ebook-cover.jpg", mimeType: JPEG });
  const thumb = await uploadAsset(admin, { contentId: id, purpose: "THUMBNAIL", file: "thumb.jpg", mimeType: JPEG });
  const book =
    format === "epub"
      ? await uploadAsset(admin, { contentId: id, purpose: "EBOOK_EPUB", file: "book.epub", mimeType: "application/epub+zip" })
      : await uploadAsset(admin, { contentId: id, purpose: "EBOOK_PDF", file: "book.pdf", mimeType: "application/pdf" });
  await admin.put(`/admin/ebooks/${id}`, {
    ebook: {
      frontCoverAssetId: await ready(admin, cover),
      thumbnailAssetId: await ready(admin, thumb),
      ...(format === "epub" ? { epubAssetId: await ready(admin, book) } : { pdfAssetId: await ready(admin, book) }),
    },
  });
  if (opts.publishIt !== false) await publish(admin, "ebooks", id);
  return { id, slug: String(created["slug"]), title };
  });
}

export async function createAudiobook(admin: Api, title: string, opts: { publishIt?: boolean } = {}): Promise<SeededItem> {
  const { genreId, languageId } = await lookups(admin, "AUDIOBOOK");
  const created = (
    await admin.post<Row>("/admin/audiobooks", { ...base(title, genreId, languageId), audiobook: { author: "E2E Author", narrator: "E2E Narrator", deliveryMode: "SINGLE_FILE" } })
  ).data;
  const id = String(created["id"]);
  return cleanupOnFailure(admin, "audiobooks", id, async () => {
  const cover = await uploadAsset(admin, { contentId: id, purpose: "AUDIOBOOK_COVER", file: "audiobook-cover.jpg", mimeType: JPEG });
  const thumb = await uploadAsset(admin, { contentId: id, purpose: "THUMBNAIL", file: "thumb.jpg", mimeType: JPEG });
  const audio = await uploadAsset(admin, { contentId: id, purpose: "AUDIOBOOK_FILE", file: "audiobook.mp3", mimeType: "audio/mpeg" });
  await admin.put(`/admin/audiobooks/${id}`, {
    audiobook: { coverAssetId: await ready(admin, cover), thumbnailAssetId: await ready(admin, thumb), mainAssetId: await ready(admin, audio) },
  });
  if (opts.publishIt !== false) await publish(admin, "audiobooks", id);
  return { id, slug: String(created["slug"]), title };
  });
}

/** Creates (or reuses) one published item of each kind, with real objects uploaded to R2. */
export async function seedAll(admin: Api): Promise<Seed> {
  const t = {
    movie: `${SEED_PREFIX} Movie`,
    epub: `${SEED_PREFIX} EPUB Book`,
    pdf: `${SEED_PREFIX} PDF Book`,
    audio: `${SEED_PREFIX} Audiobook`,
  };
  return {
    movie: (await findPublished(admin, "movies", t.movie)) ?? (await createMovie(admin, t.movie)),
    ebookEpub: (await findPublished(admin, "ebooks", t.epub)) ?? (await createEbook(admin, t.epub, "epub")),
    ebookPdf: (await findPublished(admin, "ebooks", t.pdf)) ?? (await createEbook(admin, t.pdf, "pdf")),
    audiobook: (await findPublished(admin, "audiobooks", t.audio)) ?? (await createAudiobook(admin, t.audio)),
  };
}
