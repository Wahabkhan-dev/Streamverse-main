import { useNavigate } from "@tanstack/react-router";
import { useGenreNames } from "@/hooks/useGenreNames";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import type { Movie, Promo, Restrictions } from "@/lib/data";
import { nextContentId } from "@/lib/content-id";
import { deleteDraft, useDrafts } from "@/lib/drafts";
import { draftFileKey, moveFile, movieFileKey } from "@/lib/media-store";
import { renameSlugInCatalog, reserveContentId, slugify, update, useIdSeq, useMovies, useSettings } from "@/lib/store";
import { renameUserSlug } from "@/lib/user";
import { cn } from "@/lib/utils";
import { Btn, inputCls } from "../ui";
import { useQueryClient } from "@tanstack/react-query";
import { DEMO_MODE } from "@/lib/config";
import { explain, failedUploads, pendingUploads, saveMovieLive } from "./live";
import { WizardShell, REQUIRED, reviveSnapshot, stripUrls, type StepDef } from "./engine";
import {
  Advanced,
  COUNTRIES,
  Checklist,
  DragHandle,
  FieldBox,
  GB,
  ImageSlot,
  LANGUAGES,
  MB,
  MediaUploader,
  MultiSelect,
  RENDITIONS,
  ReviewSection,
  RichText,
  Row,
  SearchSelect,
  Section,
  SelectBox2,
  Switch,
  TagInput,
  TextBox,
  imgOk,
  renditionState,
  slugOf,
  uid,
  useReorder,
  useWiz,
  fmtBytes,
  fmtDur,
  type Rules,
  type Snapshot,
} from "./kit";
import { PLACEHOLDER_IMAGE } from "@/lib/placeholder";
import {
  AgeRestrictionControl,
  AvailabilityGroup,
  VisibilityPicker,
  Hint,
  PromotionPanel,
  PublishPanel,
  ReviewGroup,
  RightsSection,
  SeoSection,
  SystemPanel,
  SystemSummary,
  TerritoryPicker,
  fmtDay,
  fmtRuntime,
  pruned,
  scheduledAt,
  seoDescOf,
  seoTitleOf,
  statusFor,
  suggestedMinAge,
  uniqueSlug,
  type Access,
  type PublishMode,
  type TerritoryMode,
} from "./shared";

type CaptionType = "Subtitle" | "Closed Caption" | "SDH";
interface LangRow {
  id: string;
  language: string;
  audio: boolean;
}
interface CapRow {
  id: string;
  language: string;
  type: CaptionType;
}
interface CastRow {
  id: string;
  actor: string;
  character: string;
  roleType: string;
}
interface CrewRow {
  id: string;
  role: string;
  name: string;
}

export interface MovieDraft {
  title: string;
  altTitle: string;
  originalTitle: string;
  shortDesc: string;
  fullDesc: string;
  releaseDate: string;
  runtime: string;
  country: string;
  genre: string;
  genres: string[];
  studio: string;
  director: string;
  producer: string;
  writer: string;
  slug: string;
  slugTouched: boolean;
  /** system-generated, never typed */
  contentId: string;
  createdAt: string;
  copyrightOwner: string;
  copyrightYear: string;
  rightsNotes: string;
  seoTitle: string;
  seoTitleEdited: boolean;
  seoDesc: string;
  seoDescEdited: boolean;
  primaryLanguage: string;
  originalLanguage: string;
  originalTouched: boolean;
  audioLangs: LangRow[];
  captions: CapRow[];
  tags: string[];
  seo: string[];
  cast: CastRow[];
  cinematographer: string;
  composer: string;
  editor: string;
  extraCrew: CrewRow[];
  ageRating: string;
  customRating: string;
  minAge: string;
  ageRestricted: boolean;
  warnings: string[];
  otherWarning: string;
  territory: TerritoryMode;
  countries: string[];
  availableFrom: string;
  availableUntil: string;
  access: Access;
  thumbFromBackdrop: boolean;
  mode: PublishMode;
  publishDate: string;
  publishTime: string;
  promo: Promo;
}

const emptyDraft = (contentId = ""): MovieDraft => ({
  title: "",
  altTitle: "",
  originalTitle: "",
  shortDesc: "",
  fullDesc: "",
  releaseDate: "",
  runtime: "",
  country: "",
  genre: "",
  genres: [],
  studio: "",
  director: "",
  producer: "",
  writer: "",
  slug: "",
  slugTouched: false,
  contentId,
  createdAt: new Date().toISOString(),
  copyrightOwner: "",
  copyrightYear: String(new Date().getFullYear()),
  rightsNotes: "",
  seoTitle: "",
  seoTitleEdited: false,
  seoDesc: "",
  seoDescEdited: false,
  primaryLanguage: "",
  originalLanguage: "",
  originalTouched: false,
  audioLangs: [],
  captions: [],
  tags: [],
  seo: [],
  cast: [],
  cinematographer: "",
  composer: "",
  editor: "",
  extraCrew: [],
  ageRating: "",
  customRating: "",
  minAge: "",
  ageRestricted: false,
  warnings: [],
  otherWarning: "",
  territory: "worldwide",
  countries: [],
  availableFrom: "",
  availableUntil: "",
  access: "Subscribers Only",
  thumbFromBackdrop: false,
  mode: "now",
  publishDate: "",
  publishTime: "",
  promo: {},
});

/** Older saved drafts and titles predate some fields: keep what they typed, and treat it as a manual choice. */
const migrate = (
  saved: Partial<MovieDraft> | undefined,
  base: MovieDraft,
  isNew: boolean,
): MovieDraft => {
  const d = { ...base, ...saved };
  // one age model: a minimum age means "restricted", and a restricted title always has an age (the gate used 18 when none was set)
  const restricted = d.ageRestricted || Number(d.minAge) > 0;
  const minAge = restricted
    ? Number(d.minAge) > 0
      ? d.minAge
      : suggestedMinAge(d.ageRating) || "18"
    : "";
  // Save as Draft and Archive are no longer publishing choices
  const mode: PublishMode =
    d.mode === "draft" || d.mode === "archive" || d.mode === "unset"
      ? isNew
        ? "unset"
        : d.mode === "archive"
          ? "archive"
          : "now"
      : d.mode;
  return {
    ...d,
    ageRestricted: restricted,
    minAge,
    mode,
    originalTouched: saved?.originalTouched ?? !!saved?.originalLanguage,
    seoTitleEdited: saved?.seoTitleEdited ?? !!saved?.seoTitle,
    seoDescEdited: saved?.seoDescEdited ?? !!saved?.seoDesc,
    contentId: saved?.contentId || base.contentId,
  };
};
const originalOf = (d: MovieDraft) => (d.originalTouched ? d.originalLanguage : d.primaryLanguage);

const RATINGS = [
  "G",
  "PG",
  "PG-13",
  "R",
  "NC-17",
  "TV-Y",
  "TV-Y7",
  "TV-G",
  "TV-PG",
  "TV-14",
  "TV-MA",
  "Custom",
];
const WARNINGS = [
  "Violence",
  "Strong Violence",
  "Strong Language",
  "Sexual Content",
  "Nudity",
  "Drugs",
  "Alcohol",
  "Smoking",
  "Frightening Scenes",
  "Mature Themes",
  "Self-Harm Themes",
  "Flashing Lights",
  "Other",
];
const ROLE_TYPES = ["Lead", "Supporting", "Cameo", "Voice", "Guest"];
const CAPTION_TYPES: CaptionType[] = ["Subtitle", "Closed Caption", "SDH"];
const EXTRA_CREW_ROLES = [
  "Assistant Director",
  "Production Designer",
  "Costume Designer",
  "Sound Designer",
  "Visual Effects",
  "Casting",
];

const VIDEO: Rules = {
  exts: ["mp4", "mov", "mkv"],
  maxBytes: 80 * GB,
  kind: "video",
  transcode: true,
};
const TRAILER: Rules = { exts: ["mp4", "mov"], maxBytes: 8 * GB, kind: "video" };
const CAPTION: Rules = { exts: ["srt", "vtt"], maxBytes: 2 * MB, kind: "caption" };
const AUDIO: Rules = { exts: ["aac", "mp3", "wav", "m4a"], maxBytes: 4 * GB, kind: "audio" };

const uploaded = (m?: { status: string }) =>
  !!m && (m.status === "processing" || m.status === "ready");

function validateMovie(s: Snapshot<MovieDraft>): Record<string, string>[] {
  const { d, media, images } = s;
  const r = (cond: unknown, id: string, o: Record<string, string>, msg = REQUIRED) => {
    if (!cond) o[id] = msg;
  };
  const media1 = (slot: string, label: string, o: Record<string, string>) => {
    const m = media[slot];
    if (!m) o[slot] = `${label} is required.`;
    else if (m.status === "error") o[slot] = m.error ?? "Fix or replace this file.";
    else if (!uploaded(m)) o[slot] = "Wait for the upload to finish.";
  };
  const s1: Record<string, string> = {};
  r(d.title.trim(), "title", s1);
  r(d.shortDesc.trim(), "shortDesc", s1);
  r(d.fullDesc.trim(), "fullDesc", s1);
  r(d.releaseDate, "releaseDate", s1);
  // the runtime is filled in from the movie file; it only has to be typed when the file's length could not be read
  const main = media["main"];
  r(d.runtime.trim() || !main || main.duration, "runtime", s1, "Enter the runtime. It could not be read from the movie file.");
  r(d.genre, "genre", s1);
  const s2: Record<string, string> = {};
  r(d.primaryLanguage, "primaryLanguage", s2);
  d.audioLangs.forEach((l) => r(l.language, `lang-${l.id}`, s2, "Choose a language."));
  d.captions.forEach((c) => r(c.language, `cap-${c.id}`, s2, "Choose a language."));
  const s3: Record<string, string> = {};
  media1("main", "The main movie file", s3);
  const s4: Record<string, string> = {};
  // the trailer is recommended, not required; a file that failed still has to be fixed or removed
  if (media["trailer"]) media1("trailer", "The official trailer", s4);
  const s5: Record<string, string> = {};
  for (const [slot, label] of [
    ["poster", "Poster"],
    ["backdrop", "Backdrop"],
    ["thumbnail", "Thumbnail"],
  ] as const) {
    const derived = slot === "thumbnail" && d.thumbFromBackdrop && imgOk(images["backdrop"]);
    r(imgOk(images[slot]) || derived, slot, s5, `${label} is required.`);
  }
  const s7: Record<string, string> = {};
  r(d.ageRating, "ageRating", s7);
  if (d.ageRating === "Custom") r(d.customRating.trim(), "customRating", s7);
  if (d.ageRestricted) {
    r(d.minAge, "minAge", s7);
    if (d.minAge && !(Number(d.minAge) >= 1 && Number(d.minAge) <= 99))
      s7["minAge"] = "Enter an age between 1 and 99.";
  }
  if (d.availableFrom && d.availableUntil && d.availableUntil < d.availableFrom)
    s7["availableUntil"] = "Available Until must be on or after Available From.";
  return [s1, s2, s3, s4, s5, {}, s7, {}];
}

function fromMovie(m: Movie): Snapshot<MovieDraft> {
  if (m.meta?.["wizard"]) {
    try {
      const saved = JSON.parse(m.meta["wizard"]) as Snapshot<MovieDraft>;
      return {
        ...saved,
        d: {
          ...migrate(saved.d, emptyDraft(m.cid ?? ""), false),
          contentId: m.cid ?? saved.d.contentId ?? "",
          createdAt: m.createdAt ?? saved.d.createdAt ?? "",
          promo: m.promo ?? saved.d.promo ?? {},
        },
      };
    } catch {
      /* fall through to the basic mapping */
    }
  }
  const rating = RATINGS.includes(m.rating) ? m.rating : "Custom";
  const r = m.restrictions;
  const info = m.info;
  const audio = (info?.audio ?? []).filter((a) => a !== (info?.language ?? "English"));
  const d: MovieDraft = {
    ...emptyDraft(m.cid ?? ""),
    createdAt: m.createdAt ?? "",
    originalTouched: false,
    title: m.title,
    slug: m.slug,
    slugTouched: true,
    shortDesc: m.description.slice(0, 250),
    fullDesc: m.description,
    releaseDate: m.release,
    runtime: m.runtime,
    country: m.meta?.["Country"] ?? "",
    genre: m.genres[0] ?? "",
    genres: m.genres.slice(1),
    primaryLanguage: info?.language ?? "English",
    ageRating: rating,
    customRating: rating === "Custom" ? m.rating : "",
    director: info?.director ?? "",
    producer: info?.producer ?? "",
    tags: info?.tags ?? [],
    audioLangs: audio.map((language) => ({ id: uid(), language, audio: true })),
    captions: (info?.subtitles ?? []).map((language) => ({
      id: uid(),
      language,
      type: "Subtitle" as CaptionType,
    })),
    cast: m.cast.map((c) => ({
      id: uid(),
      actor: c.name,
      character: c.role,
      roleType: "Supporting",
    })),
    access: r?.access ?? "Subscribers Only",
    ageRestricted: !!r?.ageRestricted,
    minAge: r?.minAge ? String(r.minAge) : "",
    warnings: r?.warnings ?? [],
    territory: r?.territory ?? "worldwide",
    countries: r?.countries ?? [],
    availableFrom: r?.availableFrom ?? "",
    availableUntil: r?.availableUntil ?? "",
    mode: m.status === "Scheduled" ? "schedule" : m.status === "Archived" ? "archive" : "now",
    publishDate: m.publishAt?.slice(0, 10) ?? "",
    publishTime: m.publishAt?.slice(11, 16) ?? "",
    promo: m.promo ?? {},
  };
  d.ageRestricted = d.ageRestricted || Number(d.minAge) > 0;
  if (d.ageRestricted && !(Number(d.minAge) > 0)) d.minAge = suggestedMinAge(d.ageRating) || "18";
  const ready = (name: string, size: number) => ({
    name,
    size,
    status: "ready" as const,
    progress: 100,
    speed: 0,
    eta: 0,
    proc: 100,
  });
  const img = {
    name: "existing-artwork.jpg",
    size: 0,
    w: 1920,
    h: 1080,
    url: m.image,
    fx: 0.5,
    fy: 0.5,
  };
  return {
    d,
    media: {
      main: { ...ready("existing-master.mp4", 0), transcode: true },
      trailer: ready("existing-trailer.mp4", 0),
    },
    images: { poster: img, backdrop: img, thumbnail: img },
  };
}

/* ---------------------------------------------------------------- small reusable bits */

/** Languages are chosen once, in Language, captions & tags. This takes the admin there without losing anything. */
function ManageLanguages() {
  const { goTo } = useWiz<MovieDraft>();
  return (
    <Btn type="button" onClick={() => goTo(1)}>
      <Plus /> ADD LANGUAGE
    </Btn>
  );
}

/* ---------------------------------------------------------------- component */

export function MovieWizard({
  existing,
  draftId,
  snapshot,
  restored,
}: {
  existing?: Movie;
  draftId: string;
  snapshot?: Snapshot<MovieDraft>;
  restored?: { at: number; onDiscard: () => void };
}) {
  const navigate = useNavigate();
  const movies = useMovies();
  const settings = useSettings();
  const genreOpts = useGenreNames("Movie").slice(1);
  const drafts = useDrafts();
  const seq = useIdSeq();

  const initial: Snapshot<MovieDraft> = snapshot
    ? reviveSnapshot({
        ...snapshot,
        d: migrate(snapshot.d, emptyDraft(existing?.cid ?? ""), !existing),
      })
    : existing
      ? fromMovie(existing)
      : {
          d: {
            ...emptyDraft(
              nextContentId(
                "MOV",
                [
                  ...movies.map((m) => m.cid),
                  ...drafts.map(
                    (x) => (x.snapshot as { d?: { contentId?: string } } | undefined)?.d?.contentId,
                  ),
                ],
                seq.MOV,
              ),
            ),
            mode: settings.autoPublish ? "now" : "unset",
            primaryLanguage: settings.defaultLanguage,
          },
          media: {},
          images: {},
        };

  // once a new title has a saved draft, its number is spent for good
  useEffect(() => {
    if (!existing && drafts.some((x) => x.id === draftId)) reserveContentId(initial.d.contentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  const qc = useQueryClient();

  /** Live mode: save through the real API (MySQL), with every uploaded file already verified in R2. */
  const finishLive = async (mode: PublishMode, s: Snapshot<MovieDraft>) => {
    const d = s.d;
    const busy = pendingUploads(s);
    if (busy.length)
      return void toast.warning(`${busy[0]}. Wait for it to finish, then try again.`);
    const failed = failedUploads(s);
    if (failed.length) return void toast.error(`Fix or remove this first: ${failed[0]}`);
    const publishing = mode === "now" || mode === "schedule";
    if (publishing && !s.media["main"]?.assetId)
      return void toast.error("Please upload the main Movie video before publishing.");
    if (publishing && !(s.images["poster"]?.assetId || s.images["poster"]?.placeholder))
      return void toast.error("Please add a poster before publishing.");
    const warnings = d.warnings
      .filter((w) => w !== "Other")
      .concat(d.warnings.includes("Other") && d.otherWarning.trim() ? [d.otherWarning.trim()] : []);
    try {
      const saved = await saveMovieLive(
        {
          c: {
            title: d.title,
            slug: d.slug,
            slugTouched: d.slugTouched,
            summary: d.shortDesc,
            description: d.fullDesc || d.shortDesc,
            releaseDate: d.releaseDate,
            genres: [d.genre, ...d.genres],
            tags: d.tags,
            seoKeywords: d.seo,
            seoTitle: seoTitleOf(d),
            seoDesc: seoDescOf(d, d.shortDesc),
            primaryLanguage: d.primaryLanguage,
            originalLanguage: originalOf(d),
            ageRating: d.ageRating === "Custom" ? d.customRating : d.ageRating,
            ageRestricted: d.ageRestricted,
            minAge: d.minAge,
            warnings,
            territory: d.territory,
            countries: d.countries,
            availableFrom: d.availableFrom,
            availableUntil: d.availableUntil,
            access: d.access,
            promo: d.promo,
          },
          runtime: d.runtime,
          studio: d.studio,
          country: d.country,
          copyrightOwner: d.copyrightOwner,
          copyrightYear: d.copyrightYear,
          rightsNotes: d.rightsNotes,
          director: d.director,
          producer: d.producer,
          writer: d.writer,
          cinematographer: d.cinematographer,
          composer: d.composer,
          editor: d.editor,
          cast: d.cast.map((c) => ({ id: c.id, actor: c.actor, character: c.character })),
          extraCrew: d.extraCrew.map((c) => ({ role: c.role, name: c.name })),
          captions: d.captions,
          audioLangs: d.audioLangs,
          mode,
          publishDate: d.publishDate,
          publishTime: d.publishTime,
        },
        s,
        existing
          ? {
              id: existing.cid ?? "",
              ...(existing.updatedAt ? { updatedAt: existing.updatedAt } : {}),
            }
          : undefined,
      );
      deleteDraft(draftId);
      await qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      toast.success(
        mode === "draft"
          ? `${d.title} saved as draft`
          : mode === "archive"
            ? `${d.title} archived`
            : mode === "schedule"
              ? `${d.title} scheduled`
              : existing
                ? `${d.title} updated`
                : `${d.title} published`,
      );
      void saved;
      navigate({ to: "/admin/movies" });
    } catch (e) {
      toast.error(explain(e));
    }
  };

  const finish = (mode: PublishMode, s: Snapshot<MovieDraft>) => {
    if (!DEMO_MODE) return void finishLive(mode, s);
    const d = s.d;
    const title = d.title.trim();
    const status = statusFor(mode, d.availableFrom);
    const others = movies.filter((m) => m.slug !== existing?.slug).map((m) => m.slug);
    const typed = slugify(d.slug);
    // a slug the admin changed while editing is kept; a taken one gets a number
    const slug = existing
      ? typed && typed !== existing.slug
        ? uniqueSlug(typed, others)
        : existing.slug
      : uniqueSlug(typed || slugify(title), others);
    if (typed && slug !== typed && slug !== existing?.slug)
      toast.info(`That address was already used, so it was saved as "${slug}".`);
    const rating =
      d.ageRating === "Custom" ? d.customRating.trim() : d.ageRating || existing?.rating || "PG-13";
    const art = [
      s.images["backdrop"],
      s.images["banner"],
      s.images["hero"],
      s.images["thumbnail"],
      s.images["poster"],
    ].find((i) => imgOk(i) && i?.url);
    const publishAt = mode === "schedule" ? scheduledAt(d.publishDate, d.publishTime) : undefined;
    const now = new Date().toISOString();
    const audioTracks = [
      d.primaryLanguage,
      ...d.audioLangs.filter((l) => l.audio && l.language).map((l) => l.language),
    ].filter(Boolean);
    const warnings = d.warnings
      .filter((w) => w !== "Other")
      .concat(d.warnings.includes("Other") && d.otherWarning.trim() ? [d.otherWarning.trim()] : []);
    const movie: Movie = {
      slug,
      title,
      year: Number(d.releaseDate.slice(0, 4)) || existing?.year || 0,
      genres: [d.genre, ...d.genres.filter((g) => g !== d.genre)].filter(Boolean),
      runtime: fmtRuntime(d.runtime),
      rating,
      badges: s.media["main"] ? ["4K", "HDR"] : (existing?.badges ?? ["HD"]),
      description: d.fullDesc.trim() || d.shortDesc.trim(),
      image: art?.url || existing?.image || PLACEHOLDER_IMAGE,
      status,
      views: existing?.views ?? 0,
      release: d.releaseDate || existing?.release || "",
      cast: d.cast
        .filter((c) => c.actor.trim())
        .map((c) => ({ name: c.actor.trim(), role: c.character.trim() || c.roleType })),
      meta: pruned<Record<string, string>>({
        "Age Rating": rating,
        Language: d.primaryLanguage,
        Country: d.country || undefined,
        "Production Studio": d.studio.trim() || undefined,
        "Copyright Owner": d.copyrightOwner.trim() || undefined,
        "Copyright Year": d.copyrightYear || undefined,
        "Rights Notes": d.rightsNotes.trim() || undefined,
        "SEO Title": seoTitleOf(d).trim() || undefined,
        "SEO Description": seoDescOf(d, d.shortDesc).trim() || undefined,
        wizard: JSON.stringify(stripUrls(s)),
      }),
      cid: existing?.cid ?? d.contentId,
      // legacy titles have no created date, and none is invented for them
      ...(existing
        ? existing.createdAt
          ? { createdAt: existing.createdAt }
          : {}
        : { createdAt: d.createdAt || now }),
      updatedAt: now,
      promo: d.promo,
      restrictions: pruned<Restrictions>({
        access: d.access,
        ageRestricted: d.ageRestricted || undefined,
        minAge: d.ageRestricted ? Number(d.minAge) || undefined : undefined,
        territory: d.territory,
        countries: d.territory === "worldwide" ? undefined : d.countries,
        availableFrom: d.availableFrom || undefined,
        availableUntil: d.availableUntil || undefined,
        warnings: warnings.length ? warnings : undefined,
      }),
      info: pruned({
        language: d.primaryLanguage || undefined,
        audio: audioTracks.length ? audioTracks : undefined,
        subtitles: d.captions.length
          ? [...new Set(d.captions.map((c) => c.language).filter(Boolean))]
          : undefined,
        director: d.director.trim() || undefined,
        producer: d.producer.trim() || undefined,
        tags: d.tags.length ? d.tags : undefined,
      }),
      ...(publishAt ? { publishAt } : {}),
    };
    update((st) => ({
      movies: existing
        ? st.movies.map((x) => (x.slug === existing.slug ? movie : x))
        : [movie, ...st.movies],
    }));
    if (!existing && status === "Published" && settings.notifyNew) {
      update((st) => ({
        announcements: [
          {
            id: Date.now(),
            kind: "New Release",
            t: `New on StreamVerse: ${title}`,
            s: "A new movie just landed",
            at: Date.now(),
          },
          ...st.announcements,
        ],
      }));
    }
    reserveContentId(movie.cid ?? "");
    if (existing && slug !== existing.slug) {
      // the title moved to a new address: lists, banners, customers' saved items and stored videos follow it
      renameSlugInCatalog("Movie", existing.slug, slug);
      renameUserSlug("Movie", existing.slug, slug);
      for (const slot of ["main", "trailer", "teaser", "bts"])
        void moveFile(movieFileKey(existing.slug, slot), movieFileKey(slug, slot));
    }
    // the uploaded videos now belong to this title, so the player can find them
    for (const slot of ["main", "trailer", "teaser", "bts"])
      void moveFile(draftFileKey(draftId, slot), movieFileKey(slug, slot));
    deleteDraft(draftId);
    toast.success(
      mode === "draft"
        ? `${title} saved as draft`
        : mode === "archive"
          ? `${title} archived`
          : mode === "schedule"
            ? `${title} scheduled`
            : existing
              ? `${title} updated`
              : `${title} published`,
    );
    if (d.access === "Hidden" && mode === "now")
      toast("This title is Hidden, so it won't appear in customer lists.");
    navigate({ to: "/admin/movies" });
  };

  const steps: StepDef<MovieDraft>[] = [
    {
      id: "basic",
      title: "Basic info",
      desc: "Title, synopsis, genre",
      validate: (s) => validateMovie(s)[0]!,
      render: () => (
        <BasicStep
          genreOpts={genreOpts}
          status={existing?.status ?? "Draft"}
          updatedAt={existing?.updatedAt}
          isNew={!existing}
        />
      ),
    },
    {
      id: "lang",
      title: "Language, captions & tags",
      desc: "Audio, captions, keywords",
      validate: (s) => validateMovie(s)[1]!,
      render: () => <LanguageStep />,
    },
    {
      id: "video",
      title: "Video files",
      desc: "Master file, captions, audio",
      validate: (s) => validateMovie(s)[2]!,
      render: () => <VideoStep />,
    },
    {
      id: "trailer",
      title: "Trailer & media",
      desc: "Optional: trailer, clips",
      validate: (s) => validateMovie(s)[3]!,
      render: () => <TrailerStep />,
    },
    {
      id: "images",
      title: "Images & banners",
      desc: "Poster, backdrop, banners",
      validate: (s) => validateMovie(s)[4]!,
      render: () => <ImagesStep />,
    },
    {
      id: "cast",
      title: "Cast & crew",
      desc: "Actors and crew credits",
      validate: () => ({}),
      render: () => <CastStep />,
    },
    {
      id: "restrict",
      title: "Restrictions & availability",
      desc: "Rating, territory, dates",
      validate: (s) => validateMovie(s)[6]!,
      render: () => <RestrictionsStep />,
    },
    {
      id: "publish",
      title: "Publish",
      desc: "Review and go live",
      validate: () => ({}),
      render: () => <PublishStep finish={finish} existing={!!existing} />,
    },
  ];

  return (
    <WizardShell
      draft={{ id: draftId, type: "Movie" }}
      initial={initial}
      steps={steps}
      titleOf={(d) => d.title.trim()}
      restored={restored}
      eyebrow={existing ? "StreamVerse / Edit movie" : "StreamVerse / Add movie"}
      title={existing ? `Edit ${existing.title}` : "Add new movie"}
      sub="Metadata first, files later. Build a complete title for the StreamVerse catalog."
      backTo="/admin/movies"
      onSaveDraft={(s, goTo) => {
        if (!s.d.title.trim()) {
          goTo(0);
          toast.warning("Add a movie title before saving a draft.");
          return;
        }
        finish("draft", s);
      }}
    />
  );
}

/* ---------------------------------------------------------------- steps */

function BasicStep({
  genreOpts,
  status,
  updatedAt,
  isNew,
}: {
  genreOpts: string[];
  status: string;
  updatedAt?: string | undefined;
  isNew: boolean;
}) {
  const { d, set } = useWiz<MovieDraft>();
  const runtimeShown = /^\d+$/.test(d.runtime.trim()) ? fmtRuntime(d.runtime) : "";
  return (
    <>
      <SystemPanel
        contentId={d.contentId || "Assigned when saved"}
        created={d.createdAt ? fmtDay(d.createdAt) : "Not available"}
        updated={isNew ? fmtDay(d.createdAt) : updatedAt ? fmtDay(updatedAt) : "Not available"}
        status={status}
      />
      <Section title="Title">
        <TextBox
          id="title"
          label="Movie Title"
          required
          value={d.title}
          onChange={(v) =>
            set((x) => ({ ...x, title: v, slug: x.slugTouched ? x.slug : slugOf(v) }))
          }
          placeholder="e.g. Crimson Horizon"
        />
      </Section>
      <Section title="Description">
        <FieldBox
          id="shortDesc"
          label="Short Description"
          required
          count={`${d.shortDesc.length} / 250`}
          hint="Shown on cards and in search results."
        >
          <textarea
            id="shortDesc"
            aria-label="Short Description"
            rows={3}
            maxLength={250}
            value={d.shortDesc}
            onChange={(e) => set((x) => ({ ...x, shortDesc: e.target.value }))}
            className={cn(inputCls, "h-auto py-2")}
          />
        </FieldBox>
        <RichText
          id="fullDesc"
          label="Full Description / Synopsis"
          required
          value={d.fullDesc}
          onChange={(v) => set((x) => ({ ...x, fullDesc: v }))}
        />
      </Section>
      <Section title="Details">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextBox
            id="releaseDate"
            label="Release Date"
            type="date"
            required
            value={d.releaseDate}
            onChange={(v) => set((x) => ({ ...x, releaseDate: v }))}
            hint={
              d.releaseDate
                ? `Release year: ${d.releaseDate.slice(0, 4)}`
                : "The original release, which may be in the past."
            }
          />
          <TextBox
            id="runtime"
            label="Runtime"
            value={d.runtime}
            onChange={(v) => set((x) => ({ ...x, runtime: v }))}
            placeholder="Filled in from the movie file"
            hint={
              runtimeShown
                ? `Shown to customers as ${runtimeShown}`
                : "Leave empty: it is read from the movie file when you upload it."
            }
          />
          <SelectBox2
            id="genre"
            label="Primary Genre"
            required
            value={d.genre}
            onChange={(v) =>
              set((x) => ({ ...x, genre: v, genres: x.genres.filter((g) => g !== v) }))
            }
            options={genreOpts}
          />
        </div>
      </Section>
      <Advanced
        title="Advanced details"
        desc="Optional. Alternative titles, more genres, country and studio."
        defaultOpen={!!(d.altTitle || d.originalTitle || d.studio || d.country || d.genres.length)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextBox
            id="altTitle"
            label="Alternative Title"
            optional
            value={d.altTitle}
            onChange={(v) => set((x) => ({ ...x, altTitle: v }))}
          />
          <TextBox
            id="originalTitle"
            label="Original Title"
            optional
            value={d.originalTitle}
            onChange={(v) => set((x) => ({ ...x, originalTitle: v }))}
          />
          <MultiSelect
            id="genres"
            label="Additional Genres"
            optional
            values={d.genres}
            onChange={(v) => set((x) => ({ ...x, genres: v }))}
            options={genreOpts.filter((g) => g !== d.genre)}
          />
          <SearchSelect
            id="country"
            label="Country of Origin"
            optional
            value={d.country}
            onChange={(v) => set((x) => ({ ...x, country: v }))}
            options={COUNTRIES}
            placeholder="Select Country"
          />
          <TextBox
            id="studio"
            label="Production Studio"
            optional
            value={d.studio}
            onChange={(v) => set((x) => ({ ...x, studio: v }))}
          />
        </div>
      </Advanced>
    </>
  );
}

function LanguageStep() {
  const { d, set, media } = useWiz<MovieDraft>();
  const capStatus = (id: string) =>
    media[`cap:${id}`]
      ? uploaded(media[`cap:${id}`])
        ? "Uploaded"
        : media[`cap:${id}`]!.status === "error"
          ? "File rejected"
          : "Uploading"
      : "File needed in Video Files";
  return (
    <>
      <Section title="Language" desc="The spoken language and any additional audio languages.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SearchSelect
            id="primaryLanguage"
            label="Primary Language"
            required
            value={d.primaryLanguage}
            onChange={(v) => set((x) => ({ ...x, primaryLanguage: v }))}
            options={LANGUAGES}
          />
          <SearchSelect
            id="originalLanguage"
            label="Original Language"
            optional
            value={originalOf(d)}
            onChange={(v) => set((x) => ({ ...x, originalLanguage: v, originalTouched: true }))}
            options={LANGUAGES}
            hint="Same as the primary language unless you change it."
          />
        </div>
        <div className="space-y-2">
          {d.primaryLanguage && (
            <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
              <span className="flex-1 font-semibold">
                {d.primaryLanguage}{" "}
                <span className="font-normal text-muted-foreground">— Primary</span>
              </span>
              <span className="text-xs text-muted-foreground">
                Audio is embedded in the main video
              </span>
            </div>
          )}
          {d.audioLangs.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-2 p-2"
            >
              <SearchSelect
                id={`lang-${l.id}`}
                value={l.language}
                onChange={(v) =>
                  set((x) => ({
                    ...x,
                    audioLangs: x.audioLangs.map((r) =>
                      r.id === l.id ? { ...r, language: v } : r,
                    ),
                  }))
                }
                options={LANGUAGES.filter((n) => n !== d.primaryLanguage)}
                placeholder="Choose language…"
                className="min-w-48 flex-1"
              />
              <Switch
                checked={l.audio}
                onChange={(v) =>
                  set((x) => ({
                    ...x,
                    audioLangs: x.audioLangs.map((r) => (r.id === l.id ? { ...r, audio: v } : r)),
                  }))
                }
                label="Audio Available"
              />
              <button
                type="button"
                aria-label="Remove language"
                className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text"
                onClick={() =>
                  set((x) => ({ ...x, audioLangs: x.audioLangs.filter((r) => r.id !== l.id) }))
                }
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <Btn
            type="button"
            onClick={() =>
              set((x) => ({
                ...x,
                audioLangs: [...x.audioLangs, { id: uid(), language: "", audio: true }],
              }))
            }
          >
            <Plus /> ADD LANGUAGE
          </Btn>
        </div>
      </Section>

      <Section
        title="Subtitle & Caption Languages"
        desc="Only choose which languages will exist. The SRT / VTT files are uploaded in the next step."
      >
        <div className="space-y-2">
          {d.captions.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-2 p-2"
            >
              <SearchSelect
                id={`cap-${c.id}`}
                value={c.language}
                onChange={(v) =>
                  set((x) => ({
                    ...x,
                    captions: x.captions.map((r) => (r.id === c.id ? { ...r, language: v } : r)),
                  }))
                }
                options={LANGUAGES}
                placeholder="Choose language…"
                className="min-w-48 flex-1"
              />
              <select
                aria-label="Caption type"
                value={c.type}
                onChange={(e) =>
                  set((x) => ({
                    ...x,
                    captions: x.captions.map((r) =>
                      r.id === c.id ? { ...r, type: e.target.value as CaptionType } : r,
                    ),
                  }))
                }
                className={cn(inputCls, "w-44 appearance-none")}
              >
                {CAPTION_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <span className="w-48 text-xs text-muted-foreground">{capStatus(c.id)}</span>
              <button
                type="button"
                aria-label="Remove caption language"
                className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text"
                onClick={() =>
                  set((x) => ({ ...x, captions: x.captions.filter((r) => r.id !== c.id) }))
                }
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {d.captions.length === 0 && (
            <Hint>
              No caption languages yet. Example: English · Closed Caption, Spanish · Subtitle.
            </Hint>
          )}
          <Btn
            type="button"
            onClick={() =>
              set((x) => ({
                ...x,
                captions: [...x.captions, { id: uid(), language: "", type: "Subtitle" }],
              }))
            }
          >
            <Plus /> ADD CAPTION LANGUAGE
          </Btn>
        </div>
      </Section>

      <Section title="Tags" desc="Shown to customers and used for discovery.">
        <TagInput
          id="tags"
          label="Tags & Keywords"
          optional
          values={d.tags}
          onChange={(v) => set((x) => ({ ...x, tags: v }))}
          noun="tags"
          placeholder="e.g. Space, Survival, Award Winning"
        />
      </Section>
      <SeoSection d={d} set={set} summary={d.shortDesc} path="movies" />
    </>
  );
}

function VideoStep() {
  const { d, set, media } = useWiz<MovieDraft>();
  const main = media["main"];
  // the movie's length comes from the file itself, so the admin does not have to type it; a value they typed is kept
  const fileMinutes = main?.duration ? Math.max(1, Math.round(main.duration / 60)) : undefined;
  const runtimeEmpty = !d.runtime.trim();
  useEffect(() => {
    if (fileMinutes && runtimeEmpty) set((x) => ({ ...x, runtime: String(fileMinutes) }));
    // `set` is a new function on every render; only the file length and the empty field decide this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileMinutes, runtimeEmpty]);
  const tracks = d.audioLangs.filter((l) => l.audio && l.language);
  let pendingShown = false;
  return (
    <>
      <Section
        title="Main movie file"
        desc={
          DEMO_MODE
            ? "Upload one master file. The server creates every quality rendition. In this demo the file you upload is kept in this browser and plays in the player; MP4 (H.264 + AAC) plays everywhere."
            : "Upload one master file (MP4, MOV or MKV). It goes straight to storage, is verified, then processed into streaming qualities. It shows Ready only when the server has finished."
        }
      >
        <MediaUploader
          slot="main"
          label="Main Movie File"
          required
          big
          rules={VIDEO}
          hint="MP4, MOV or MKV · one master file"
        />
        {DEMO_MODE ? (
          <div>
            <div className="mb-2 text-xs font-semibold text-soft">Output Renditions</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[...RENDITIONS].map((r) => {
                const state = main
                  ? renditionState(main, r.at, !pendingShown && main.proc < r.at)
                  : "Waiting";
                if (state === "Processing") pendingShown = true;
                return (
                  <div
                    key={r.name}
                    className="rounded-md border border-border bg-surface-2 px-3 py-2.5"
                  >
                    <div className="text-sm font-bold">{r.name}</div>
                    <div
                      className={cn(
                        "text-xs font-medium",
                        state === "Ready"
                          ? "text-success"
                          : state === "Processing"
                            ? "text-warning"
                            : "text-muted-foreground",
                      )}
                    >
                      {main ? state : "Waiting for upload"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Caption files"
        desc="Captions chosen in Language, Captions & Tags appear here automatically."
        action={<ManageLanguages />}
      >
        {d.captions.length === 0 ? (
          <Hint>
            No caption languages were selected. ADD LANGUAGE takes you to Language, captions & tags;
            nothing you have entered is lost.
          </Hint>
        ) : (
          d.captions.map((c) => (
            <div key={c.id}>
              <div className="mb-1 text-sm font-semibold">
                {c.language || "Unnamed language"}{" "}
                <span className="font-normal text-muted-foreground">· {c.type}</span>
              </div>
              <MediaUploader
                slot={`cap:${c.id}`}
                label={`${c.language || "Caption"} ${c.type} file`}
                rules={CAPTION}
                hint="Upload SRT / VTT"
                validNote="Valid caption file"
              />
            </div>
          ))
        )}
      </Section>

      <Section
        title="Additional audio tracks"
        desc="Languages marked “Audio Available” appear here. The primary track is already embedded in the main video."
        action={<ManageLanguages />}
      >
        {tracks.length === 0 ? (
          <Hint>No additional audio languages were selected.</Hint>
        ) : (
          tracks.map((l) => (
            <div key={l.id}>
              <div className="mb-1 text-sm font-semibold">{l.language}</div>
              <MediaUploader
                slot={`aud:${l.id}`}
                label={`${l.language} audio track`}
                rules={AUDIO}
                hint="AAC, MP3, WAV or M4A"
              />
            </div>
          ))
        )}
      </Section>
      {main?.status === "ready" && (
        <p className="text-xs text-success">All renditions are ready.</p>
      )}
    </>
  );
}

function TrailerStep() {
  const { goTo } = useWiz<MovieDraft>();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-4">
        <div>
          <div className="text-sm font-bold">
            Trailer & media{" "}
            <span className="ml-1.5 align-middle text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
              Optional
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nothing here is needed to publish. Add a trailer or extra videos now, or skip this step.
          </p>
        </div>
        <Btn type="button" onClick={() => goTo(4)}>
          SKIP THIS STEP
        </Btn>
      </div>
      <Section
        title="Official trailer"
        desc="Recommended. Shown on the movie page and used for the Trailer button."
      >
        <MediaUploader
          slot="trailer"
          label="Official Trailer"
          optional
          rules={TRAILER}
          big
          hint="MP4 or MOV"
        />
        <ImageSlot
          slot="trailerThumb"
          label="Custom trailer thumbnail"
          optional
          rec={{ w: 1280, h: 720 }}
        />
      </Section>
      <Section title="More videos" desc="All optional. Extra videos shown on the movie page.">
        <div className="grid gap-4 md:grid-cols-2">
          <MediaUploader slot="teaser" label="Teaser Trailer" optional rules={TRAILER} />
          <MediaUploader slot="bts" label="Behind the Scenes" optional rules={TRAILER} />
          <MediaUploader slot="clip1" label="Clip 1" optional rules={TRAILER} />
          <MediaUploader slot="clip2" label="Clip 2" optional rules={TRAILER} />
        </div>
      </Section>
    </>
  );
}

function ImagesStep() {
  const { d, set, images } = useWiz<MovieDraft>();
  const back = images["backdrop"];
  return (
    <>
      <Section
        title="Required images"
        desc="Images are never stretched. Use Crop or the focal point to control framing."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ImageSlot slot="poster" label="Poster" required rec={{ w: 680, h: 1020 }} />
          <ImageSlot slot="backdrop" label="Backdrop" required rec={{ w: 1920, h: 1080 }} />
          {d.thumbFromBackdrop ? (
            <div
              id="f-thumbnail"
              className="scroll-mt-28 rounded-lg border border-border bg-surface-2 p-3"
            >
              <div className="mb-2 text-xs font-semibold text-soft">
                Thumbnail <span className="text-primary-text">*</span>{" "}
                <span className="font-normal text-muted-foreground">· made from the backdrop</span>
              </div>
              {imgOk(back) && back?.url ? (
                <img
                  src={back.url}
                  alt="Thumbnail preview from backdrop"
                  className="aspect-video w-full rounded-md object-cover"
                  style={{
                    objectPosition: `${(back.fx ?? 0.5) * 100}% ${(back.fy ?? 0.5) * 100}%`,
                  }}
                />
              ) : (
                <div className="grid aspect-video place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                  Add the backdrop first
                </div>
              )}
            </div>
          ) : (
            <ImageSlot slot="thumbnail" label="Thumbnail" required rec={{ w: 400, h: 225 }} />
          )}
        </div>
        <Switch
          checked={d.thumbFromBackdrop}
          onChange={(v) => set((x) => ({ ...x, thumbFromBackdrop: v }))}
          label="Use backdrop as thumbnail"
        />
      </Section>
      <Section
        title="Banners"
        desc="All optional. Used when this movie is promoted on the homepage."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ImageSlot slot="banner" label="Normal Banner" optional rec={{ w: 1280, h: 720 }} />
          <ImageSlot slot="hero" label="Featured Hero Banner" optional rec={{ w: 1920, h: 800 }} />
          <ImageSlot
            slot="latest"
            label="Latest Release Banner"
            optional
            rec={{ w: 1200, h: 628 }}
          />
          <ImageSlot slot="mobile" label="Mobile Banner" optional rec={{ w: 1080, h: 1350 }} />
        </div>
      </Section>
    </>
  );
}

function CastStep() {
  const { d, set } = useWiz<MovieDraft>();
  const reorder = useReorder(d.cast, (cast) => set((x) => ({ ...x, cast })));
  const crew: [string, keyof MovieDraft][] = [
    ["Director", "director"],
    ["Producer", "producer"],
    ["Writer", "writer"],
    ["Cinematographer", "cinematographer"],
    ["Composer", "composer"],
    ["Editor", "editor"],
  ];
  return (
    <>
      <Section
        title="Cast"
        desc="Drag the handle to change the display order."
        action={
          <Btn
            type="button"
            onClick={() =>
              set((x) => ({
                ...x,
                cast: [...x.cast, { id: uid(), actor: "", character: "", roleType: "Supporting" }],
              }))
            }
          >
            <Plus /> ADD CAST MEMBER
          </Btn>
        }
      >
        {d.cast.length === 0 && <Hint>No cast members yet.</Hint>}
        {d.cast.map((c, i) => {
          const rd = reorder(i);
          return (
            <div
              key={c.id}
              {...rd.row}
              className="grid gap-3 rounded-md border border-border bg-surface-2 p-3 md:grid-cols-[auto_auto_1fr_1fr_160px_auto]"
            >
              <div className="flex items-center gap-2">
                <DragHandle {...rd.handle} />
                <span className="w-6 text-xs font-bold text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="w-24">
                <ImageSlot
                  slot={`castimg:${c.id}`}
                  label="Photo"
                  rec={{ w: 400, h: 400 }}
                  compact
                />
              </div>
              <TextBox
                id={`actor-${c.id}`}
                label="Actor Name"
                value={c.actor}
                onChange={(v) =>
                  set((x) => ({
                    ...x,
                    cast: x.cast.map((r) => (r.id === c.id ? { ...r, actor: v } : r)),
                  }))
                }
              />
              <TextBox
                id={`char-${c.id}`}
                label="Character Name"
                value={c.character}
                onChange={(v) =>
                  set((x) => ({
                    ...x,
                    cast: x.cast.map((r) => (r.id === c.id ? { ...r, character: v } : r)),
                  }))
                }
              />
              <SelectBox2
                id={`role-${c.id}`}
                label="Role Type"
                value={c.roleType}
                onChange={(v) =>
                  set((x) => ({
                    ...x,
                    cast: x.cast.map((r) => (r.id === c.id ? { ...r, roleType: v } : r)),
                  }))
                }
                options={ROLE_TYPES}
              />
              <div className="flex items-end gap-1">
                <Btn
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Move up"
                  onClick={() => rd.move(-1)}
                  disabled={i === 0}
                >
                  ↑
                </Btn>
                <Btn
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Move down"
                  onClick={() => rd.move(1)}
                  disabled={i === d.cast.length - 1}
                >
                  ↓
                </Btn>
                <button
                  type="button"
                  aria-label="Remove cast member"
                  className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text"
                  onClick={() => set((x) => ({ ...x, cast: x.cast.filter((r) => r.id !== c.id) }))}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </Section>
      <Section
        title="Crew"
        desc="All crew details are optional. This is the only place director, producer and writer are entered."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {crew.slice(0, 3).map(([label, k]) => (
            <TextBox
              key={k}
              id={`crew-${k}`}
              label={label}
              value={String(d[k] ?? "")}
              onChange={(v) => set((x) => ({ ...x, [k]: v }))}
            />
          ))}
        </div>
      </Section>
      <Advanced
        title="More crew roles"
        desc="Optional. Cinematographer, composer, editor and other credits."
        defaultOpen={!!(d.cinematographer || d.composer || d.editor || d.extraCrew.length)}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {crew.slice(3).map(([label, k]) => (
            <TextBox
              key={k}
              id={`crew-${k}`}
              label={label}
              value={String(d[k] ?? "")}
              onChange={(v) => set((x) => ({ ...x, [k]: v }))}
            />
          ))}
        </div>
        {d.extraCrew.map((c) => (
          <div key={c.id} className="grid gap-3 sm:grid-cols-[220px_1fr_auto]">
            <SelectBox2
              id={`xrole-${c.id}`}
              label="Role"
              value={c.role}
              onChange={(v) =>
                set((x) => ({
                  ...x,
                  extraCrew: x.extraCrew.map((r) => (r.id === c.id ? { ...r, role: v } : r)),
                }))
              }
              options={EXTRA_CREW_ROLES}
            />
            <TextBox
              id={`xname-${c.id}`}
              label="Name"
              value={c.name}
              onChange={(v) =>
                set((x) => ({
                  ...x,
                  extraCrew: x.extraCrew.map((r) => (r.id === c.id ? { ...r, name: v } : r)),
                }))
              }
            />
            <button
              type="button"
              aria-label="Remove crew member"
              className="mt-6 grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text"
              onClick={() =>
                set((x) => ({ ...x, extraCrew: x.extraCrew.filter((r) => r.id !== c.id) }))
              }
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Btn
          type="button"
          onClick={() =>
            set((x) => ({
              ...x,
              extraCrew: [...x.extraCrew, { id: uid(), role: EXTRA_CREW_ROLES[0]!, name: "" }],
            }))
          }
        >
          <Plus /> ADD CREW MEMBER
        </Btn>
      </Advanced>
    </>
  );
}

function RestrictionsStep() {
  const { d, set } = useWiz<MovieDraft>();
  const suggestion = suggestedMinAge(d.ageRating);
  return (
    <>
      <VisibilityPicker access={d.access} onAccess={(access) => set((x) => ({ ...x, access }))} />
      <Section
        title="Age rating & restriction"
        desc="The rating describes the movie. The restriction is what asks customers to confirm their age."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectBox2
            id="ageRating"
            label="Age Rating"
            required
            value={d.ageRating}
            onChange={(v) => set((x) => ({ ...x, ageRating: v }))}
            options={RATINGS}
          />
          {d.ageRating === "Custom" && (
            <TextBox
              id="customRating"
              label="Custom Rating"
              required
              value={d.customRating}
              onChange={(v) => set((x) => ({ ...x, customRating: v }))}
            />
          )}
        </div>
        <AgeRestrictionControl
          restricted={d.ageRestricted}
          minAge={d.minAge}
          onRestricted={(v) => set((x) => ({ ...x, ageRestricted: v }))}
          onMinAge={(v) => set((x) => ({ ...x, minAge: v }))}
          suggestion={suggestion}
          ratingLabel={d.ageRating}
        />
      </Section>
      <Advanced
        title="Content warnings"
        desc="Optional. Describe anything customers should know about. This does not restrict access."
        defaultOpen={d.warnings.length > 0}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {WARNINGS.map((w) => (
            <label
              key={w}
              className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="accent-[var(--primary)]"
                checked={d.warnings.includes(w)}
                onChange={(e) =>
                  set((x) => ({
                    ...x,
                    warnings: e.target.checked
                      ? [...x.warnings, w]
                      : x.warnings.filter((y) => y !== w),
                  }))
                }
              />
              {w}
            </label>
          ))}
        </div>
        {d.warnings.includes("Other") && (
          <TextBox
            id="otherWarning"
            label="Describe the other warning"
            optional
            value={d.otherWarning}
            onChange={(v) => set((x) => ({ ...x, otherWarning: v }))}
          />
        )}
      </Advanced>
      <AvailabilityGroup d={d} set={set} />
      <RightsSection d={d} set={set} />
    </>
  );
}

function PublishStep({
  finish,
  existing,
}: {
  finish: (m: PublishMode, s: Snapshot<MovieDraft>) => void;
  existing: boolean;
}) {
  const { d, set, snap, media, images, goTo } = useWiz<MovieDraft>();
  const all = validateMovie(snap);
  const ok = all.every((e) => Object.keys(e).length === 0);
  const rating = d.ageRating === "Custom" ? d.customRating : d.ageRating;
  const capUp = d.captions.filter((c) => uploaded(media[`cap:${c.id}`])).length;
  const tracks = d.audioLangs.filter((l) => l.audio && l.language);
  const imgs = Object.keys(images).filter((k) => !k.startsWith("castimg:"));
  const territory =
    d.territory === "worldwide"
      ? "Worldwide"
      : `${d.territory === "selected" ? "Only in" : "Everywhere except"} ${d.countries.join(", ") || "(no countries chosen)"}`;
  return (
    <>
      <Section
        title="Required details"
        desc="Everything marked in red must be completed before this movie can go live."
      >
        <Checklist
          items={[
            { label: "Movie title", ok: !all[0]!["title"], step: 0 },
            { label: "Short description", ok: !all[0]!["shortDesc"], step: 0 },
            { label: "Description", ok: !all[0]!["fullDesc"], step: 0 },
            {
              label: "Release date & runtime",
              ok: !all[0]!["releaseDate"] && !all[0]!["runtime"],
              step: 0,
            },
            { label: "Primary genre", ok: !all[0]!["genre"], step: 0 },
            { label: "Primary language", ok: !all[1]!["primaryLanguage"], step: 1 },
            { label: "Main video", ok: !all[2]!["main"], step: 2 },
            { label: "Poster", ok: !all[4]!["poster"], step: 4 },
            { label: "Backdrop", ok: !all[4]!["backdrop"], step: 4 },
            { label: "Thumbnail", ok: !all[4]!["thumbnail"], step: 4 },
            { label: "Age rating", ok: !all[6]!["ageRating"] && !all[6]!["customRating"], step: 6 },
          ]}
        />
      </Section>
      <ReviewGroup title="Optional details">
        <div className="grid gap-4 lg:grid-cols-2">
          <ReviewSection
            title="Basic Information"
            onEdit={() => goTo(0)}
            ok={Object.keys(all[0]!).length === 0}
          >
            <Row k="Title" v={d.title} />
            <Row k="Release" v={d.releaseDate} />
            <Row k="Runtime" v={fmtRuntime(d.runtime)} />
            <Row k="Country" v={d.country} />
            <Row k="Genres" v={[d.genre, ...d.genres].filter(Boolean).join(", ")} />
            <Row k="Studio" v={d.studio} />
          </ReviewSection>
          <ReviewSection title="Language" onEdit={() => goTo(1)} ok={!all[1]!["primaryLanguage"]}>
            <Row k="Primary" v={d.primaryLanguage} />
            <Row k="Original" v={originalOf(d)} />
            <Row
              k="Additional audio"
              v={d.audioLangs
                .filter((l) => l.language)
                .map((l) => l.language)
                .join(", ")}
            />
          </ReviewSection>
          <ReviewSection title="Caption Languages" onEdit={() => goTo(1)}>
            <Row k="Languages" v={d.captions.map((c) => `${c.language} (${c.type})`).join(", ")} />
          </ReviewSection>
          <ReviewSection title="Tags" onEdit={() => goTo(1)}>
            <Row k="Tags" v={d.tags.join(", ")} />
            <Row k="SEO keywords" v={d.seo.join(", ")} />
          </ReviewSection>
          <ReviewSection title="Main Video" onEdit={() => goTo(2)} ok={!all[2]!["main"]}>
            <Row
              k="File"
              v={
                media["main"]
                  ? `${media["main"].name} · ${fmtBytes(media["main"].size)}${media["main"].duration ? ` · ${fmtDur(media["main"].duration)}` : ""}`
                  : ""
              }
            />
            <Row
              k="Renditions"
              v={
                media["main"]?.status === "ready"
                  ? DEMO_MODE
                    ? "4K, 1080p, 720p, 480p ready"
                    : "Processed by the server"
                  : media["main"]
                    ? "Processing"
                    : ""
              }
            />
          </ReviewSection>
          <ReviewSection title="Audio Tracks" onEdit={() => goTo(2)}>
            <Row
              k="Uploaded"
              v={
                tracks.length
                  ? `${tracks.filter((l) => uploaded(media[`aud:${l.id}`])).length} of ${tracks.length}`
                  : "None required"
              }
            />
          </ReviewSection>
          <ReviewSection title="Captions" onEdit={() => goTo(2)}>
            <Row k="Uploaded" v={d.captions.length ? `${capUp} of ${d.captions.length}` : "None"} />
          </ReviewSection>
          <ReviewSection title="Trailer" onEdit={() => goTo(3)} ok={!all[3]!["trailer"]}>
            <Row k="Official trailer" v={media["trailer"]?.name} />
          </ReviewSection>
          <ReviewSection
            title="Images"
            onEdit={() => goTo(4)}
            ok={Object.keys(all[4]!).length === 0}
          >
            <Row k="Uploaded" v={imgs.join(", ")} />
          </ReviewSection>
          <ReviewSection title="Cast" onEdit={() => goTo(5)}>
            <Row
              k="Cast"
              v={d.cast
                .filter((c) => c.actor)
                .map((c) => c.actor)
                .join(", ")}
            />
            <Row k="Director" v={d.director} />
          </ReviewSection>
          <ReviewSection title="Age Rating" onEdit={() => goTo(6)} ok={!all[6]!["ageRating"]}>
            <Row k="Rating" v={rating} />
            <Row k="Age restriction" v={d.ageRestricted ? `Minimum age ${d.minAge}` : "None"} />
            <Row k="Warnings" v={d.warnings.join(", ")} />
          </ReviewSection>
          <ReviewSection title="Territories" onEdit={() => goTo(6)}>
            <Row k="Availability" v={territory} />
          </ReviewSection>
          <ReviewSection title="Availability" onEdit={() => goTo(6)}>
            <Row k="From" v={d.availableFrom} />
            <Row k="Until" v={d.availableUntil} />
            <Row k="Visibility" v={d.access} />
          </ReviewSection>
          <ReviewSection title="Rights" onEdit={() => goTo(6)}>
            <Row k="Owner" v={d.copyrightOwner} />
            <Row k="Year" v={d.copyrightYear} />
          </ReviewSection>
        </div>
      </ReviewGroup>
      <SystemSummary
        contentId={d.contentId || "Assigned when saved"}
        created={d.createdAt ? fmtDay(d.createdAt) : "Not available"}
        slug={d.slug || slugOf(d.title)}
        status={
          d.mode === "now"
            ? "Draft until published"
            : d.mode === "schedule"
              ? "Draft until scheduled"
              : d.mode === "archive"
                ? "Archived"
                : "Draft"
        }
      />
      {media["main"] && media["main"].status !== "ready" && (
        <Hint>
          The main video is still being processed. You can publish now; renditions will finish in
          the background.
        </Hint>
      )}
      <PromotionPanel promo={d.promo} onChange={(promo) => set((x) => ({ ...x, promo }))} />
      <PublishPanel
        mode={d.mode}
        onMode={(mode) => set((x) => ({ ...x, mode }))}
        publishDate={d.publishDate}
        publishTime={d.publishTime}
        onDate={(publishDate) => set((x) => ({ ...x, publishDate }))}
        onTime={(publishTime) => set((x) => ({ ...x, publishTime }))}
        ready={ok}
        noun="movie"
        onGo={() => finish(d.mode, snap)}
        existing={existing}
      />
    </>
  );
}

export const emptyMovieDraft = emptyDraft;
