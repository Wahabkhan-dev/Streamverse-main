/**
 * Live mode, edit: reads a saved title back through the admin API into the wizard's own snapshot, so every step opens
 * pre-filled and every file shows as the real attached asset (not a placeholder).
 */
import { api } from "@/api/client";
import { mediaLibraryApi, type MediaDetail } from "@/api/mediaLibrary.api";
import type { Book, Movie } from "@/lib/data";
import { uiStatus } from "@/lib/api-mappers";
import type { Img, Media, Snapshot } from "./kit";
import { emptyAudioDraft, type AudioDraft } from "./AudiobookWizard";
import { emptyEbookDraft, type EbookDraft } from "./EbookWizard";
import { emptyMovieDraft, type MovieDraft } from "./MovieWizard";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const day = (v: unknown) => str(v).slice(0, 10);

export type Kind = "movies" | "ebooks" | "audiobooks";

/** Finds a title by its slug (the URL) and returns the full admin record. */
export async function fetchBySlug(kind: Kind, slug: string): Promise<Row | null> {
  const rows = (
    await api.get<{ data: Row[] }>(`/admin/${kind}?search=${encodeURIComponent(slug)}&limit=20`)
  ).data;
  const hit = rows.find((r) => r["slug"] === slug);
  return hit ? (await api.get<{ data: Row }>(`/admin/${kind}/${String(hit["id"])}`)).data : null;
}

async function details(ids: Array<string | null | undefined>): Promise<Map<string, MediaDetail>> {
  const out = new Map<string, MediaDetail>();
  await Promise.all(
    [...new Set(ids.filter((x): x is string => !!x))].map(async (id) => {
      try {
        out.set(id, (await mediaLibraryApi.detail(id)).data);
      } catch {
        /* a vanished file simply shows as not attached */
      }
    }),
  );
  return out;
}

const mediaOf = (d: MediaDetail | undefined): Media | undefined =>
  d
    ? {
        name: d.displayTitle || d.fileName || "File",
        size: d.sizeBytes ?? 0,
        status: d.status === "READY" ? "ready" : d.status === "FAILED" ? "error" : "processing",
        progress: 100,
        speed: 0,
        eta: 0,
        proc: d.status === "READY" ? 100 : (d.progress?.percent ?? 0),
        ...(d.progress ? { procStep: d.progress.step, procEta: d.progress.etaSeconds } : {}),
        assetId: d.id,
        ...(d.durationSeconds != null ? { duration: d.durationSeconds } : {}),
        ...(d.status === "FAILED"
          ? { error: d.processingError ?? "Processing failed. Replace the file." }
          : {}),
        ...(d.type === "MOVIE_MASTER" ? { transcode: true } : {}),
      }
    : undefined;

const imageOf = (d: MediaDetail | undefined): Img | undefined =>
  d && d.previewUrl
    ? {
        name: d.displayTitle || d.fileName || "image",
        size: d.sizeBytes ?? 0,
        w: d.width ?? 0,
        h: d.height ?? 0,
        url: d.previewUrl,
        fx: 0.5,
        fy: 0.5,
        assetId: d.id,
        up: "ready",
      }
    : undefined;

function fill(
  slots: Array<[string, string | null | undefined, "media" | "image"]>,
  det: Map<string, MediaDetail>,
) {
  const media: Record<string, Media> = {};
  const images: Record<string, Img> = {};
  for (const [slot, id, kind] of slots) {
    if (!id) continue;
    if (kind === "media") {
      const m = mediaOf(det.get(id));
      if (m) media[slot] = m;
    } else {
      const i = imageOf(det.get(id));
      if (i) images[slot] = i;
    }
  }
  return { media, images };
}

const regionName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

const ACCESS = {
  PUBLIC: "Public",
  SUBSCRIBERS_ONLY: "Subscribers Only",
  HIDDEN: "Hidden",
} as const;

/** Fields shared by all three drafts. */
function shared(row: Row) {
  const age = (row["age"] ?? {}) as Row;
  const terr = (row["territory"] ?? {}) as Row;
  const dates = (row["dates"] ?? {}) as Row;
  const seo = (row["seo"] ?? {}) as Row;
  const promo = (row["promo"] ?? {}) as Row;
  const langs = (row["languages"] as Row[] | undefined) ?? [];
  const genres = ((row["genres"] as Row[] | undefined) ?? []).map((g) => str(g["name"]));
  const status = str(row["status"]);
  const publishAt = str(dates["publishAt"]);
  return {
    title: str(row["title"]),
    slug: str(row["slug"]),
    slugTouched: true,
    createdAt: str(row["createdAt"]),
    contentId: str(row["contentCode"]),
    genre: genres[0] ?? "",
    genres: genres.slice(1),
    tags: ((row["tags"] as Row[] | undefined) ?? []).map((t) => str(t["name"])),
    seo: ((seo["seoKeywords"] as string[] | undefined) ?? []).map(String),
    seoTitle: str(seo["seoTitle"]),
    seoTitleEdited: !!seo["seoTitle"],
    seoDesc: str(seo["seoDescription"]),
    seoDescEdited: !!seo["seoDescription"],
    primaryLanguage: str(langs.find((l) => l["role"] === "PRIMARY")?.["name"]),
    originalLanguage: str(langs.find((l) => l["role"] === "ORIGINAL")?.["name"]),
    originalTouched: langs.some((l) => l["role"] === "ORIGINAL"),
    ageRating: str(age["ageRating"]),
    ageRestricted: age["ageRestricted"] === true,
    minAge: age["minimumAge"] != null ? str(age["minimumAge"]) : "",
    territory: (terr["mode"] === "INCLUDE"
      ? "selected"
      : terr["mode"] === "EXCLUDE"
        ? "exclude"
        : "worldwide") as "worldwide" | "selected" | "exclude",
    countries: ((terr["countryCodes"] as string[] | undefined) ?? []).map(regionName),
    availableFrom: day(dates["availableFrom"]),
    availableUntil: day(dates["availableUntil"]),
    access: ACCESS[str(row["visibility"]) as keyof typeof ACCESS] ?? "Subscribers Only",
    promo: {
      featured: !!promo["featured"],
      trending: !!promo["trending"],
      popular: !!promo["popular"],
      newRelease: !!promo["newRelease"],
    },
    mode: (status === "PUBLISHED"
      ? "now"
      : status === "SCHEDULED"
        ? "schedule"
        : status === "ARCHIVED"
          ? "archive"
          : "unset") as "now" | "schedule" | "archive" | "unset",
    publishDate: publishAt.slice(0, 10),
    publishTime: publishAt.slice(11, 16),
    summary: str(row["summary"]),
    description: str(row["description"]),
    release: day(dates["releaseDate"]),
    langs,
  };
}

/** The minimal list-shaped record the wizard expects for "the title being edited". */
function existingOf(row: Row, extra: Row): Movie & Book {
  return {
    slug: str(row["slug"]),
    title: str(row["title"]),
    year: Number(day((row["dates"] as Row | undefined)?.["releaseDate"]).slice(0, 4)) || 0,
    genres: ((row["genres"] as Row[] | undefined) ?? []).map((g) => str(g["name"])),
    description: str(row["description"]),
    image: "",
    status: uiStatus(str(row["status"])),
    views: 0,
    cid: str(row["id"]),
    createdAt: str(row["createdAt"]),
    updatedAt: str(row["updatedAt"]),
    cast: [],
    ...extra,
  } as unknown as Movie & Book;
}

/* ------------------------------------------------------------------ movie */

export async function loadMovie(
  row: Row,
): Promise<{ existing: Movie; snapshot: Snapshot<MovieDraft> }> {
  const sh = shared(row);
  const m = (row["movie"] ?? {}) as Row;
  const crew = (row["crew"] as Row[] | undefined) ?? [];
  const crewOf = (role: string) =>
    crew
      .filter((c) => c["role"] === role)
      .map((c) => str(c["name"]))
      .join(", ");
  const caps = (row["captions"] as Row[] | undefined) ?? [];
  const auds = (row["audioTracks"] as Row[] | undefined) ?? [];
  const langName = (id: unknown) => str(sh.langs.find((l) => l["languageId"] === id)?.["name"]);
  const ids = [
    m["posterAssetId"],
    m["backdropAssetId"],
    m["thumbnailAssetId"],
    m["masterAssetId"],
    m["trailerAssetId"],
    m["teaserAssetId"],
    ...caps.map((c) => c["mediaAssetId"]),
    ...auds.map((a) => a["mediaAssetId"]),
  ] as Array<string | null>;
  const det = await details(ids);
  const base = emptyMovieDraft(sh.contentId);
  const capRows = caps.map((c, i) => ({
    id: `cap${i}`,
    language: langName(c["languageId"]),
    type: (c["type"] === "CLOSED_CAPTION"
      ? "Closed Caption"
      : c["type"] === "SDH"
        ? "SDH"
        : "Subtitle") as "Subtitle" | "Closed Caption" | "SDH",
  }));
  const audRows = auds.map((a, i) => ({
    id: `aud${i}`,
    language: langName(a["languageId"]),
    audio: true,
  }));
  const d: MovieDraft = {
    ...base,
    title: sh.title,
    slug: sh.slug,
    slugTouched: true,
    createdAt: sh.createdAt,
    shortDesc: sh.summary,
    fullDesc: sh.description,
    releaseDate: sh.release,
    runtime: m["runtimeMinutes"] != null ? str(m["runtimeMinutes"]) : "",
    country: m["countryOfOrigin"] ? regionName(str(m["countryOfOrigin"])) : "",
    genre: sh.genre,
    genres: sh.genres,
    studio: str(m["productionStudio"]),
    director: crewOf("DIRECTOR"),
    producer: crewOf("PRODUCER"),
    writer: crewOf("WRITER"),
    cinematographer: crewOf("CINEMATOGRAPHER"),
    composer: crewOf("COMPOSER"),
    editor: crewOf("EDITOR"),
    extraCrew: crew
      .filter((c) => c["role"] === "OTHER")
      .map((c, i) => ({ id: `x${i}`, role: "Other", name: str(c["name"]) })),
    copyrightOwner: str(m["copyrightOwner"]),
    copyrightYear: m["copyrightYear"] != null ? str(m["copyrightYear"]) : base.copyrightYear,
    rightsNotes: str(m["rightsNotes"]),
    seoTitle: sh.seoTitle,
    seoTitleEdited: sh.seoTitleEdited,
    seoDesc: sh.seoDesc,
    seoDescEdited: sh.seoDescEdited,
    primaryLanguage: sh.primaryLanguage,
    originalLanguage: sh.originalLanguage,
    originalTouched: sh.originalTouched,
    audioLangs: audRows,
    captions: capRows,
    tags: sh.tags,
    seo: sh.seo,
    cast: ((row["cast"] as Row[] | undefined) ?? []).map((c, i) => ({
      id: `c${i}`,
      actor: str(c["name"]),
      character: str(c["characterName"]),
      roleType: "Supporting",
    })),
    ageRating: sh.ageRating,
    ageRestricted: sh.ageRestricted,
    minAge: sh.minAge,
    territory: sh.territory,
    countries: sh.countries,
    availableFrom: sh.availableFrom,
    availableUntil: sh.availableUntil,
    access: sh.access,
    mode: sh.mode,
    publishDate: sh.publishDate,
    publishTime: sh.publishTime,
    promo: sh.promo,
  };
  const slots: Array<[string, string | null | undefined, "media" | "image"]> = [
    ["main", m["masterAssetId"] as string | null, "media"],
    ["trailer", m["trailerAssetId"] as string | null, "media"],
    ["teaser", m["teaserAssetId"] as string | null, "media"],
    ["poster", m["posterAssetId"] as string | null, "image"],
    ["backdrop", m["backdropAssetId"] as string | null, "image"],
    ["thumbnail", m["thumbnailAssetId"] as string | null, "image"],
    ...caps.map((c, i): [string, string | null, "media"] => [
      `cap:cap${i}`,
      c["mediaAssetId"] as string | null,
      "media",
    ]),
    ...auds.map((a, i): [string, string | null, "media"] => [
      `aud:aud${i}`,
      a["mediaAssetId"] as string | null,
      "media",
    ]),
  ];
  const { media, images } = fill(slots, det);
  const image = images["poster"]?.url ?? "";
  return {
    existing: existingOf(row, {
      image,
      runtime: d.runtime,
      rating: d.ageRating,
      release: sh.release,
    }) as Movie,
    snapshot: { d, media, images },
  };
}

/* ------------------------------------------------------------------ eBook */

export async function loadEbook(
  row: Row,
): Promise<{ existing: Book; snapshot: Snapshot<EbookDraft> }> {
  const sh = shared(row);
  const e = (row["ebook"] ?? {}) as Row;
  const editions = (row["editions"] as Row[] | undefined) ?? [];
  const det = await details([
    e["epubAssetId"],
    e["pdfAssetId"],
    e["sampleAssetId"],
    e["frontCoverAssetId"],
    e["backCoverAssetId"],
    e["spineAssetId"],
    e["fullWrapAssetId"],
    e["thumbnailAssetId"],
  ] as Array<string | null>);
  const base = emptyEbookDraft(sh.contentId);
  const d: EbookDraft = {
    ...base,
    title: sh.title,
    slug: sh.slug,
    slugTouched: true,
    createdAt: sh.createdAt,
    author: str(e["author"]),
    coAuthor: str(e["coAuthor"]),
    editor: str(e["editor"]),
    publisher: str(e["publisher"]),
    isbn: str(e["isbn"]),
    edition: str(e["edition"]),
    series: str(e["series"]),
    seriesNumber: e["seriesNumber"] != null ? str(e["seriesNumber"]) : "",
    pubDate: day(e["publicationDate"]),
    pages: e["pageCount"] != null ? str(e["pageCount"]) : "",
    summary: sh.summary,
    fullDesc: sh.description,
    genre: sh.genre,
    subgenre: sh.genres[0] ?? "",
    seoTitle: sh.seoTitle,
    seoTitleEdited: sh.seoTitleEdited,
    seoDesc: sh.seoDesc,
    seoDescEdited: sh.seoDescEdited,
    primaryLanguage: sh.primaryLanguage,
    originalLanguage: sh.originalLanguage,
    originalTouched: sh.originalTouched,
    flipbook: e["flipbookEnabled"] === true,
    translations: editions.map((x, i) => ({
      id: `t${i}`,
      language: str(
        sh.langs.find((l) => l["languageId"] === x["languageId"])?.["name"] ?? x["languageName"],
      ),
      translatedTitle: str(x["translatedTitle"]),
      translator: str(x["translator"]),
      fileRequired: true,
      ownCover: !!x["coverAssetId"],
    })),
    tags: sh.tags,
    seo: sh.seo,
    readingAge: sh.ageRating,
    ageRestricted: sh.ageRestricted,
    minAge: sh.minAge,
    territory: sh.territory,
    countries: sh.countries,
    availableFrom: sh.availableFrom,
    availableUntil: sh.availableUntil,
    access: sh.access,
    copyrightOwner: str(e["copyrightOwner"]),
    copyrightYear: e["copyrightYear"] != null ? str(e["copyrightYear"]) : base.copyrightYear,
    rightsNotes: str(e["rightsNotes"]),
    mode: sh.mode,
    publishDate: sh.publishDate,
    publishTime: sh.publishTime,
    promo: sh.promo,
  };
  const { media, images } = fill(
    [
      ["epub", e["epubAssetId"] as string | null, "media"],
      ["pdf", e["pdfAssetId"] as string | null, "media"],
      ["sample", e["sampleAssetId"] as string | null, "media"],
      ["front", e["frontCoverAssetId"] as string | null, "image"],
      ["back", e["backCoverAssetId"] as string | null, "image"],
      ["spine", e["spineAssetId"] as string | null, "image"],
      ["wrap", e["fullWrapAssetId"] as string | null, "image"],
      ["thumb", e["thumbnailAssetId"] as string | null, "image"],
    ],
    det,
  );
  return {
    existing: existingOf(row, {
      author: d.author,
      isbn: d.isbn,
      cover: images["front"]?.url ?? "",
    }) as Book,
    snapshot: { d, media, images },
  };
}

/* ------------------------------------------------------------------ audiobook */

export async function loadAudiobook(
  row: Row,
): Promise<{ existing: Book; snapshot: Snapshot<AudioDraft> }> {
  const sh = shared(row);
  const a = (row["audiobook"] ?? {}) as Row;
  const chapters = ((row["chapters"] as Row[] | undefined) ?? [])
    .slice()
    .sort((x, y) => Number(x["displayOrder"] ?? 0) - Number(y["displayOrder"] ?? 0));
  const editions = (row["editions"] as Row[] | undefined) ?? [];
  const det = await details([
    a["mainAssetId"],
    a["previewAssetId"],
    a["coverAssetId"],
    a["thumbnailAssetId"],
    ...chapters.map((c) => c["audioAssetId"]),
    ...editions.map((x) => x["audioAssetId"]),
    ...editions.map((x) => x["narratorImageAssetId"]),
  ] as Array<string | null>);
  const base = emptyAudioDraft(sh.contentId);
  const chapterRows = chapters.map((c, i) => ({
    id: `ch${i}`,
    title: str(c["title"]),
    duration:
      c["durationSeconds"] != null ? str(Math.round(Number(c["durationSeconds"]) / 60)) : "",
    start: "",
    end: "",
  }));
  const d: AudioDraft = {
    ...base,
    title: sh.title,
    slug: sh.slug,
    slugTouched: true,
    createdAt: sh.createdAt,
    author: str(a["author"]),
    narrator: str(a["narrator"]),
    publisher: str(a["publisher"]),
    isbn: str(a["isbn"]),
    series: str(a["series"]),
    seriesNumber: a["seriesNumber"] != null ? str(a["seriesNumber"]) : "",
    releaseDate: day(a["releaseDate"]) || sh.release,
    summary: sh.summary,
    fullDesc: sh.description,
    genre: sh.genre,
    subgenre: sh.genres[0] ?? "",
    seoTitle: sh.seoTitle,
    seoTitleEdited: sh.seoTitleEdited,
    seoDesc: sh.seoDesc,
    seoDescEdited: sh.seoDescEdited,
    primaryLanguage: sh.primaryLanguage,
    originalLanguage: sh.originalLanguage,
    originalTouched: sh.originalTouched,
    editions: editions.map((x, i) => ({
      id: `e${i}`,
      language: str(
        sh.langs.find((l) => l["languageId"] === x["languageId"])?.["name"] ?? x["languageName"],
      ),
      narrator: str(x["narrator"]),
      bio: str(x["narratorBio"]),
    })),
    tags: sh.tags,
    seo: sh.seo,
    chapterMode: a["deliveryMode"] === "CHAPTER_FILES" ? "chapters" : "single",
    chapters: chapterRows.length ? chapterRows : base.chapters,
    readingAge: sh.ageRating,
    ageRestricted: sh.ageRestricted,
    minAge: sh.minAge,
    territory: sh.territory,
    countries: sh.countries,
    availableFrom: sh.availableFrom,
    availableUntil: sh.availableUntil,
    access: sh.access,
    copyrightOwner: str(a["copyrightOwner"]),
    copyrightYear: a["copyrightYear"] != null ? str(a["copyrightYear"]) : base.copyrightYear,
    rightsNotes: str(a["rightsNotes"]),
    mode: sh.mode,
    publishDate: sh.publishDate,
    publishTime: sh.publishTime,
    promo: sh.promo,
  };
  const { media, images } = fill(
    [
      ["master", a["mainAssetId"] as string | null, "media"],
      ["preview", a["previewAssetId"] as string | null, "media"],
      ["cover", a["coverAssetId"] as string | null, "image"],
      ["thumb", a["thumbnailAssetId"] as string | null, "image"],
      ...chapters.map((c, i): [string, string | null, "media"] => [
        `ch:ch${i}`,
        c["audioAssetId"] as string | null,
        "media",
      ]),
      ...editions.map((x, i): [string, string | null, "media"] => [
        `ed:e${i}`,
        x["audioAssetId"] as string | null,
        "media",
      ]),
      ...editions.map((x, i): [string, string | null, "image"] => [
        `ednarr:e${i}`,
        x["narratorImageAssetId"] as string | null,
        "image",
      ]),
    ],
    det,
  );
  return {
    existing: existingOf(row, {
      author: d.author,
      narrator: d.narrator,
      cover: images["cover"]?.url ?? "",
    }) as Book,
    snapshot: { d, media, images },
  };
}
