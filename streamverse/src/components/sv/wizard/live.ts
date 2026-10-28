/**
 * Live mode bridge for the original Movie / eBook / Audiobook wizards.
 *
 * In demo mode the wizards keep working against browser storage exactly as before. When VITE_DEMO_MODE=false the same
 * screens use this file: files go straight to R2 through the existing upload pipeline, and the finished form is saved
 * through the real admin API into MySQL. Nothing here fakes success: every step waits for the server's answer.
 */
import { api } from "@/api/client";
import type { ApiMeta } from "@/api/types";
import { isApiError } from "@/api/client";
import type { Img, Media, Snapshot } from "./kit";
import { scheduledAt, type Access, type PublishMode, type TerritoryMode } from "./shared";

type Row = Record<string, unknown>;
const unwrap = async <T>(p: Promise<{ data: T; meta?: ApiMeta }>) => (await p).data;

/* ------------------------------------------------------------------ upload purposes */

/** What a wizard upload slot is FOR. `undefined` = decided by the file extension (movie file, audiobook audio, EPUB, PDF, picture). */
export function purposeForSlot(slot: string): string | undefined {
  if (slot === "main") return "MOVIE_MASTER";
  if (slot === "trailer") return "TRAILER";
  if (slot === "teaser") return "TEASER";
  if (["bts", "clip1", "clip2"].includes(slot)) return "TRAILER";
  if (slot.startsWith("cap:")) return "CAPTION";
  if (slot.startsWith("aud:")) return "AUDIO_TRACK";
  if (slot === "sample") return "EBOOK_SAMPLE";
  if (slot === "epub" || /^tr:.*:epub$/.test(slot)) return "EBOOK_EPUB";
  if (slot === "pdf" || /^tr:.*:pdf$/.test(slot)) return "EBOOK_PDF";
  if (slot === "master" || slot.startsWith("ed:")) return "AUDIOBOOK_FILE";
  if (slot === "preview") return "AUDIOBOOK_PREVIEW";
  if (slot.startsWith("ch:")) return "AUDIOBOOK_CHAPTER";
  return undefined;
}

/** The asset id a slot holds once its upload is READY (or a library file was chosen for it). */
export const assetOf = (s: Snapshot<unknown>, slot: string): string | undefined => {
  const m = s.media[slot];
  if (m?.assetId && m.status === "ready") return m.assetId;
  const i = s.images[slot];
  return i?.assetId && i.up !== "uploading" && i.up !== "error" ? i.assetId : undefined;
};

/** Anything still on its way to storage, or failed: the wizard must not save/publish over it. */
export function pendingUploads(s: Snapshot<unknown>): string[] {
  const out: string[] = [];
  for (const [k, m] of Object.entries(s.media))
    if (m.status === "uploading" || m.status === "processing" || m.status === "paused")
      out.push(`${m.name} is still uploading or processing`);
  for (const [k, i] of Object.entries(s.images))
    if (i.up === "uploading") out.push(`${i.name} is still uploading`);
  void 0;
  return out;
}
export function failedUploads(s: Snapshot<unknown>): string[] {
  const out: string[] = [];
  for (const m of Object.values(s.media))
    if (m.status === "error") out.push(`${m.name}: ${m.error ?? "upload failed"}`);
  for (const i of Object.values(s.images))
    if (i.up === "error") out.push(`${i.name}: ${i.upError ?? "upload failed"}`);
  return out;
}

/* ------------------------------------------------------------------ lookups (names -> ids) */

let cache: { genres?: Row[]; languages?: Row[]; tags?: Row[]; warnings?: Row[]; at: number } = {
  at: 0,
};
async function lists() {
  if (Date.now() - cache.at > 30_000) cache = { at: Date.now() };
  cache.genres ??= await unwrap(api.get<{ data: Row[] }>("/admin/genres?limit=100"));
  cache.languages ??= await unwrap(api.get<{ data: Row[] }>("/admin/languages?limit=100"));
  cache.tags ??= await unwrap(api.get<{ data: Row[] }>("/admin/tags?limit=200"));
  cache.warnings ??= await unwrap(api.get<{ data: Row[] }>("/admin/warning-types"));
  return cache as Required<typeof cache>;
}
const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

async function genreIds(names: string[]): Promise<string[]> {
  const { genres } = await lists();
  return [
    ...new Set(
      names
        .map((n) => genres.find((g) => norm(g["name"]) === norm(n))?.["id"])
        .filter((x): x is string => !!x),
    ),
  ].slice(0, 10) as string[];
}
async function languageId(name: string): Promise<string | undefined> {
  const { languages } = await lists();
  return (languages.find((l) => norm(l["name"]) === norm(name)) ??
    languages.find((l) => norm(l["code"]) === norm(name)))?.["id"] as string | undefined;
}
async function tagIds(names: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const raw of [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 30)) {
    const { tags } = await lists();
    let hit = tags.find((t) => norm(t["name"]) === norm(raw));
    if (!hit) {
      hit = await unwrap(api.post<{ data: Row }>("/admin/tags", { name: raw.slice(0, 40) }));
      tags.push(hit);
    }
    out.push(String(hit["id"]));
  }
  return out;
}
async function warningIds(names: string[]): Promise<string[]> {
  const { warnings } = await lists();
  return names
    .map(
      (n) =>
        warnings.find(
          (w) => norm(w["label"]) === norm(n) || norm(w["key"]).replace(/_/g, " ") === norm(n),
        )?.["id"],
    )
    .filter((x): x is string => !!x) as string[];
}

let regionNames: Map<string, string> | undefined;
/** "Brazil" -> "BR" (the wizards list countries by name; the API stores ISO codes). */
export function countryCode(name: string): string | undefined {
  if (!regionNames) {
    regionNames = new Map();
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const n = dn.of(code);
        if (n && n !== code) regionNames.set(norm(n), code);
      }
    regionNames.set("united states", "US");
    regionNames.set("uk", "GB");
  }
  return regionNames.get(norm(name));
}

/* ------------------------------------------------------------------ common body */

export interface Common {
  title: string;
  slug: string;
  slugTouched: boolean;
  summary: string;
  description: string;
  releaseDate: string;
  genres: string[];
  tags: string[];
  seoKeywords: string[];
  seoTitle: string;
  seoDesc: string;
  primaryLanguage: string;
  originalLanguage: string;
  ageRating: string;
  ageRestricted: boolean;
  minAge: string;
  warnings: string[];
  territory: TerritoryMode;
  countries: string[];
  availableFrom: string;
  availableUntil: string;
  access: Access;
  promo:
    { featured?: boolean; trending?: boolean; popular?: boolean; newRelease?: boolean } | undefined;
}

const VISIBILITY: Record<Access, string> = {
  Public: "PUBLIC",
  "Subscribers Only": "SUBSCRIBERS_ONLY",
  Hidden: "HIDDEN",
};
const day = (v: string) => (v ? v : undefined);

async function commonBody(c: Common, isNew: boolean): Promise<Row> {
  const codes =
    c.territory === "worldwide" ? [] : c.countries.map(countryCode).filter((x): x is string => !!x);
  if (c.territory !== "worldwide" && !codes.length)
    throw new Error("Choose at least one country for the selected territory.");
  const langs: Array<{ languageId: string; role: string }> = [];
  const primary = c.primaryLanguage ? await languageId(c.primaryLanguage) : undefined;
  if (primary) langs.push({ languageId: primary, role: "PRIMARY" });
  const orig =
    c.originalLanguage && c.originalLanguage !== c.primaryLanguage
      ? await languageId(c.originalLanguage)
      : undefined;
  if (orig && orig !== primary) langs.push({ languageId: orig, role: "ORIGINAL" });
  const warningTypeIds = await warningIds(c.warnings);
  return {
    title: c.title.trim(),
    ...(isNew && c.slugTouched && c.slug ? { manualSlug: c.slug } : {}),
    summary: c.summary.slice(0, 500),
    description: c.description.slice(0, 5000),
    visibility: VISIBILITY[c.access],
    ...(day(c.releaseDate) ? { releaseDate: c.releaseDate } : {}),
    ...(day(c.availableFrom) ? { availableFrom: c.availableFrom } : {}),
    ...(day(c.availableUntil) ? { availableUntil: c.availableUntil } : {}),
    age: {
      ...(c.ageRating ? { ageRating: c.ageRating.slice(0, 10) } : {}),
      ageRestricted: c.ageRestricted,
      ...(c.ageRestricted ? { minimumAge: Math.min(21, Math.max(0, Number(c.minAge) || 18)) } : {}),
    },
    territory: {
      mode:
        c.territory === "selected"
          ? "INCLUDE"
          : c.territory === "exclude"
            ? "EXCLUDE"
            : "WORLDWIDE",
      countryCodes: codes,
    },
    promo: {
      featured: !!c.promo?.featured,
      trending: !!c.promo?.trending,
      popular: !!c.promo?.popular,
      newRelease: !!c.promo?.newRelease,
    },
    seo: {
      ...(c.seoTitle ? { seoTitle: c.seoTitle.slice(0, 70) } : {}),
      ...(c.seoDesc ? { seoDescription: c.seoDesc.slice(0, 160) } : {}),
      seoKeywords: c.seoKeywords.slice(0, 20),
    },
    genreIds: await genreIds(c.genres),
    tagIds: await tagIds(c.tags),
    warningTypeIds,
    languages: langs,
  };
}

/* ------------------------------------------------------------------ publishing */

export type Kind = "movies" | "ebooks" | "audiobooks";

/** Saves the title, then moves it to the state the admin chose. Returns the saved row. */
/**
 * The "last changed" stamp of every title saved in this session. If the save worked but a later step (publish) failed, pressing
 * the button again must send the stamp of OUR save, not the one the page loaded with - that older one is now out of date and
 * the server would answer 409 "changed since you loaded it".
 */
const savedStamps = new Map<string, string>();
const stampOf = (existing: { id: string; updatedAt?: string }): string | undefined => savedStamps.get(existing.id) ?? existing.updatedAt;

async function settle(
  kind: Kind,
  id: string,
  mode: PublishMode,
  d: { publishDate: string; publishTime: string },
  updatedAt?: string,
): Promise<void> {
  if (updatedAt) savedStamps.set(id, updatedAt);
  const stamp = updatedAt ? { expectedUpdatedAt: updatedAt } : {};
  if (mode === "now") await api.post(`/admin/${kind}/${id}/publish`, {});
  else if (mode === "schedule") {
    const at = scheduledAt(d.publishDate, d.publishTime);
    if (!at) throw new Error("Choose a publish date and time first.");
    await api.post(`/admin/${kind}/${id}/schedule`, { publishAt: at, ...stamp });
  } else if (mode === "archive") await api.post(`/admin/${kind}/${id}/archive`, {});
}

export function explain(e: unknown): string {
  return isApiError(e) ? e.message : e instanceof Error ? e.message : "Something went wrong.";
}

/* ------------------------------------------------------------------ MOVIE */

export interface MovieLive {
  c: Common;
  runtime: string;
  studio: string;
  country: string;
  copyrightOwner: string;
  copyrightYear: string;
  rightsNotes: string;
  director: string;
  producer: string;
  writer: string;
  cinematographer: string;
  composer: string;
  editor: string;
  cast: Array<{ actor: string; character: string; id: string }>;
  extraCrew: Array<{ role: string; name: string }>;
  captions: Array<{ id: string; language: string; type: string }>;
  audioLangs: Array<{ id: string; language: string; audio: boolean }>;
  mode: PublishMode;
  publishDate: string;
  publishTime: string;
}

const minutes = (v: string): number | undefined => {
  const t = v.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = /(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i.exec(t);
  const n = (Number(m?.[1] ?? 0) || 0) * 60 + (Number(m?.[2] ?? 0) || 0);
  return n > 0 ? n : undefined;
};

export async function saveMovieLive(
  m: MovieLive,
  s: Snapshot<unknown>,
  existing?: { id: string; updatedAt?: string },
) {
  const body = await commonBody(m.c, !existing);
  const code = m.country ? countryCode(m.country) : undefined;
  const crew: Array<{ name: string; role: string; displayOrder: number }> = [];
  const add = (name: string, role: string) =>
    name.trim() && crew.push({ name: name.trim(), role, displayOrder: crew.length });
  add(m.director, "DIRECTOR");
  add(m.producer, "PRODUCER");
  add(m.writer, "WRITER");
  add(m.cinematographer, "CINEMATOGRAPHER");
  add(m.composer, "COMPOSER");
  add(m.editor, "EDITOR");
  for (const x of m.extraCrew) add(x.name, "OTHER");

  const captions: Row[] = [];
  for (const c of m.captions) {
    const lang = await languageId(c.language);
    const asset = assetOf(s, `cap:${c.id}`);
    if (lang)
      captions.push({
        languageId: lang,
        type:
          c.type === "Closed Caption" ? "CLOSED_CAPTION" : c.type === "SDH" ? "SDH" : "SUBTITLE",
        ...(asset ? { mediaAssetId: asset } : {}),
      });
  }
  const audioTracks: Row[] = [];
  const addAudioLang: Row[] = [];
  for (const l of m.audioLangs) {
    const lang = await languageId(l.language);
    if (!lang) continue;
    const asset = assetOf(s, `aud:${l.id}`);
    if (l.audio) audioTracks.push({ languageId: lang, ...(asset ? { mediaAssetId: asset } : {}) });
    addAudioLang.push({ languageId: lang, role: "ADDITIONAL_AUDIO" });
  }
  const languages = [
    ...(body["languages"] as Row[]),
    ...addAudioLang.filter(
      (a) => !(body["languages"] as Row[]).some((x) => x["languageId"] === a["languageId"]),
    ),
  ];

  // no runtime typed: use the movie file's own length
  const fileSeconds = s.media["main"]?.duration;
  const runtime = minutes(m.runtime) ?? (fileSeconds ? Math.max(1, Math.round(fileSeconds / 60)) : undefined);
  const movie: Row = {
    ...(runtime ? { runtimeMinutes: Math.min(1000, runtime) } : {}),
    ...(m.studio.trim() ? { productionStudio: m.studio.trim() } : {}),
    ...(code ? { countryOfOrigin: code } : {}),
    ...(m.copyrightOwner.trim() ? { copyrightOwner: m.copyrightOwner.trim() } : {}),
    ...(Number(m.copyrightYear) ? { copyrightYear: Number(m.copyrightYear) } : {}),
    ...(m.rightsNotes.trim() ? { rightsNotes: m.rightsNotes.trim() } : {}),
  };
  const slots: Array<[string, string]> = [
    ["posterAssetId", "poster"],
    ["backdropAssetId", "backdrop"],
    ["thumbnailAssetId", "thumbnail"],
    ["masterAssetId", "main"],
    ["trailerAssetId", "trailer"],
    ["teaserAssetId", "teaser"],
  ];
  for (const [field, slot] of slots) {
    const id = assetOf(s, slot);
    if (id) movie[field] = id;
  }
  const payload: Row = {
    ...body,
    languages,
    movie,
    crew,
    cast: m.cast
      .filter((c) => c.actor.trim())
      .map((c, i) => ({
        name: c.actor.trim(),
        ...(c.character.trim() ? { characterName: c.character.trim() } : {}),
        displayOrder: i,
        ...(assetOf(s, `castimg:${c.id}`) ? { imageAssetId: assetOf(s, `castimg:${c.id}`) } : {}),
      })),
    captions,
    audioTracks,
  };
  if (existing) delete payload["manualSlug"];
  const saved = existing
    ? await unwrap(
        api.patch<{ data: Row }>(`/admin/movies/${existing.id}`, {
          ...payload,
          ...(stampOf(existing) ? { expectedUpdatedAt: stampOf(existing) } : {}),
        }),
      )
    : await unwrap(api.post<{ data: Row }>("/admin/movies", payload));
  const id = String(saved["id"]);
  await settle("movies", id, m.mode, m, saved["updatedAt"] as string | undefined);
  return { id, slug: String(saved["slug"]) };
}

/* ------------------------------------------------------------------ EBOOK */

export interface EbookLive {
  c: Common;
  author: string;
  coAuthor: string;
  editor: string;
  publisher: string;
  isbn: string;
  edition: string;
  series: string;
  seriesNumber: string;
  pubDate: string;
  pages: string;
  copyrightOwner: string;
  copyrightYear: string;
  rightsNotes: string;
  flipbook: boolean;
  translations: Array<{
    id: string;
    language: string;
    translatedTitle: string;
    translator: string;
  }>;
  mode: PublishMode;
  publishDate: string;
  publishTime: string;
}

export async function saveEbookLive(
  e: EbookLive,
  s: Snapshot<unknown>,
  existing?: { id: string; updatedAt?: string },
) {
  const body = await commonBody(e.c, !existing);
  const ebook: Row = {
    ...(e.author.trim() ? { author: e.author.trim() } : {}),
    ...(e.coAuthor.trim() ? { coAuthor: e.coAuthor.trim() } : {}),
    ...(e.editor.trim() ? { editor: e.editor.trim() } : {}),
    ...(e.publisher.trim() ? { publisher: e.publisher.trim() } : {}),
    ...(e.isbn.trim() ? { isbn: e.isbn.trim() } : {}),
    ...(e.edition.trim() ? { edition: e.edition.trim() } : {}),
    ...(e.series.trim() ? { series: e.series.trim() } : {}),
    ...(Number(e.seriesNumber) ? { seriesNumber: Number(e.seriesNumber) } : {}),
    ...(Number(e.pages) ? { pageCount: Number(e.pages) } : {}),
    ...(e.pubDate ? { publicationDate: e.pubDate } : {}),
    ...(e.copyrightOwner.trim() ? { copyrightOwner: e.copyrightOwner.trim() } : {}),
    ...(Number(e.copyrightYear) ? { copyrightYear: Number(e.copyrightYear) } : {}),
    ...(e.rightsNotes.trim() ? { rightsNotes: e.rightsNotes.trim() } : {}),
    // always sent: turning the flipbook off on an existing title must reach the server too
    flipbookEnabled: e.flipbook,
  };
  const slots: Array<[string, string]> = [
    ["epubAssetId", "epub"],
    ["pdfAssetId", "pdf"],
    ["sampleAssetId", "sample"],
    ["frontCoverAssetId", "front"],
    ["backCoverAssetId", "back"],
    ["spineAssetId", "spine"],
    ["fullWrapAssetId", "wrap"],
    ["thumbnailAssetId", "thumb"],
  ];
  for (const [field, slot] of slots) {
    const id = assetOf(s, slot);
    if (id) ebook[field] = id;
  }
  const payload: Row = { ...body, ebook };
  if (existing) delete payload["manualSlug"];
  const saved = existing
    ? await unwrap(
        api.patch<{ data: Row }>(`/admin/ebooks/${existing.id}`, {
          ...payload,
          ...(stampOf(existing) ? { expectedUpdatedAt: stampOf(existing) } : {}),
        }),
      )
    : await unwrap(api.post<{ data: Row }>("/admin/ebooks", payload));
  const id = String(saved["id"]);
  if (!existing) {
    for (const t of e.translations) {
      const lang = await languageId(t.language);
      if (!lang) continue;
      await api.post(`/admin/ebooks/${id}/editions`, {
        languageId: lang,
        translatedTitle: (t.translatedTitle || e.c.title).slice(0, 200),
        ...(t.translator ? { translator: t.translator } : {}),
        ...(assetOf(s, `tr:${t.id}:epub`) ? { epubAssetId: assetOf(s, `tr:${t.id}:epub`) } : {}),
        ...(assetOf(s, `tr:${t.id}:pdf`) ? { pdfAssetId: assetOf(s, `tr:${t.id}:pdf`) } : {}),
        ...(assetOf(s, `trcover:${t.id}`) ? { coverAssetId: assetOf(s, `trcover:${t.id}`) } : {}),
      });
    }
  }
  await settle("ebooks", id, e.mode, e, saved["updatedAt"] as string | undefined);
  return { id, slug: String(saved["slug"]) };
}

/* ------------------------------------------------------------------ AUDIOBOOK */

export interface AudiobookLive {
  c: Common;
  author: string;
  narrator: string;
  narratorBio: string;
  publisher: string;
  isbn: string;
  series: string;
  seriesNumber: string;
  copyrightOwner: string;
  copyrightYear: string;
  rightsNotes: string;
  chapterMode: "single" | "chapters";
  thumbFromCover: boolean;
  chapters: Array<{ id: string; title: string; duration: string }>;
  editions: Array<{ id: string; language: string; narrator: string; bio: string }>;
  mode: PublishMode;
  publishDate: string;
  publishTime: string;
}

const seconds = (v: string): number | undefined => {
  const t = v.trim();
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return Number(t) * 60;
  const parts = t.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  return parts.reduce((a, n) => a * 60 + n, 0) || undefined;
};

export async function saveAudiobookLive(
  a: AudiobookLive,
  s: Snapshot<unknown>,
  existing?: { id: string; updatedAt?: string },
) {
  const body = await commonBody(a.c, !existing);
  const audiobook: Row = {
    ...(a.author.trim() ? { author: a.author.trim() } : {}),
    ...(a.narrator.trim() ? { narrator: a.narrator.trim() } : {}),
    ...(a.publisher.trim() ? { publisher: a.publisher.trim() } : {}),
    ...(a.isbn.trim() ? { isbn: a.isbn.trim() } : {}),
    ...(a.series.trim() ? { series: a.series.trim() } : {}),
    ...(Number(a.seriesNumber) ? { seriesNumber: Number(a.seriesNumber) } : {}),
    ...(a.c.releaseDate ? { releaseDate: a.c.releaseDate } : {}),
    deliveryMode: a.chapterMode === "single" ? "SINGLE_FILE" : "CHAPTER_FILES",
    ...(a.copyrightOwner.trim() ? { copyrightOwner: a.copyrightOwner.trim() } : {}),
    ...(Number(a.copyrightYear) ? { copyrightYear: Number(a.copyrightYear) } : {}),
    ...(a.rightsNotes.trim() ? { rightsNotes: a.rightsNotes.trim() } : {}),
  };
  const cover = assetOf(s, "cover");
  const slots: Array<[string, string | undefined]> = [
    ["mainAssetId", a.chapterMode === "single" ? assetOf(s, "master") : undefined],
    ["previewAssetId", assetOf(s, "preview")],
    ["coverAssetId", cover],
    ["thumbnailAssetId", a.thumbFromCover ? cover : assetOf(s, "thumb")],
  ];
  for (const [field, id] of slots) if (id) audiobook[field] = id;
  const payload: Row = { ...body, audiobook };
  if (existing) delete payload["manualSlug"];
  const saved = existing
    ? await unwrap(
        api.patch<{ data: Row }>(`/admin/audiobooks/${existing.id}`, {
          ...payload,
          ...(stampOf(existing) ? { expectedUpdatedAt: stampOf(existing) } : {}),
        }),
      )
    : await unwrap(api.post<{ data: Row }>("/admin/audiobooks", payload));
  const id = String(saved["id"]);
  if (!existing) {
    if (a.chapterMode === "chapters") {
      let n = 0;
      for (const c of a.chapters) {
        n++;
        const audioAssetId = assetOf(s, `ch:${c.id}`);
        const dur = seconds(c.duration);
        await api.post(`/admin/audiobooks/${id}/chapters`, {
          chapterNumber: n,
          title: (c.title || `Chapter ${n}`).slice(0, 200),
          displayOrder: n - 1,
          ...(audioAssetId ? { audioAssetId } : {}),
          ...(dur ? { durationSeconds: dur } : {}),
        });
      }
    }
    for (const ed of a.editions) {
      const lang = await languageId(ed.language);
      if (!lang) continue;
      await api.post(`/admin/audiobooks/${id}/editions`, {
        languageId: lang,
        narrator: (ed.narrator || a.narrator || "Narrator").slice(0, 200),
        ...(ed.bio ? { narratorBio: ed.bio.slice(0, 2000) } : {}),
        ...(assetOf(s, `ednarr:${ed.id}`)
          ? { narratorImageAssetId: assetOf(s, `ednarr:${ed.id}`) }
          : {}),
        ...(assetOf(s, `ed:${ed.id}`) ? { audioAssetId: assetOf(s, `ed:${ed.id}`) } : {}),
      });
    }
  }
  await settle("audiobooks", id, a.mode, a, saved["updatedAt"] as string | undefined);
  return { id, slug: String(saved["slug"]) };
}

/* ------------------------------------------------------------------ edit: read a saved title back into a wizard snapshot */

export type { Img, Media };
