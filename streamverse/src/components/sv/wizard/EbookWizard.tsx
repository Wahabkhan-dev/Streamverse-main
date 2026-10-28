import { useNavigate } from "@tanstack/react-router";
import { useGenreNames } from "@/hooks/useGenreNames";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { ebooks as seedEbooks, type Book, type Promo, type Restrictions } from "@/lib/data";
import { nextContentId } from "@/lib/content-id";
import { deleteDraft, useDrafts } from "@/lib/drafts";
import { renameSlugInCatalog, reserveContentId, slugify, update, useEbooks, useIdSeq, useSettings } from "@/lib/store";
import { renameUserSlug } from "@/lib/user";
import { Btn } from "../ui";
import { useQueryClient } from "@tanstack/react-query";
import { DEMO_MODE } from "@/lib/config";
import { explain, failedUploads, pendingUploads, saveEbookLive } from "./live";
import { WizardShell, REQUIRED, reviveSnapshot, stripUrls, type StepDef } from "./engine";
import {
  Advanced,
  Checklist,
  ImageSlot,
  imgOk,
  LANGUAGES,
  MB,
  MediaUploader,
  ReviewSection,
  RichText,
  Row,
  SearchSelect,
  Section,
  SelectBox2,
  Switch,
  TagInput,
  TextBox,
  fmtBytes,
  slugOf,
  uid,
  useWiz,
  type Rules,
  type Snapshot,
} from "./kit";
import {
  BookRestrictions,
  Hint,
  PromotionPanel,
  PublishPanel,
  ReviewGroup,
  SeoSection,
  SystemPanel,
  SystemSummary,
  fmtDay,
  pruned,
  scheduledAt,
  seoDescOf,
  seoTitleOf,
  statusFor,
  uniqueSlug,
  type Access,
  type BookRestrictionFields,
  type PublishMode,
} from "./shared";

interface Translation {
  id: string;
  language: string;
  translatedTitle: string;
  translator: string;
  fileRequired: boolean;
  ownCover: boolean;
}
export interface EbookDraft extends BookRestrictionFields {
  title: string;
  subtitle: string;
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
  summary: string;
  fullDesc: string;
  genre: string;
  subgenre: string;
  slug: string;
  slugTouched: boolean;
  /** system-generated, never typed */
  contentId: string;
  createdAt: string;
  seoTitle: string;
  seoTitleEdited: boolean;
  seoDesc: string;
  seoDescEdited: boolean;
  primaryLanguage: string;
  originalLanguage: string;
  originalTouched: boolean;
  translations: Translation[];
  /** also offer a page-turn (flipbook) version, built from the PDF */
  flipbook: boolean;
  tags: string[];
  seo: string[];
  mode: PublishMode;
  publishDate: string;
  publishTime: string;
  promo: Promo;
}

const emptyDraft = (contentId = ""): EbookDraft => ({
  title: "",
  subtitle: "",
  author: "",
  coAuthor: "",
  editor: "",
  publisher: "",
  isbn: "",
  edition: "",
  series: "",
  seriesNumber: "",
  pubDate: "",
  pages: "",
  summary: "",
  fullDesc: "",
  genre: "",
  subgenre: "",
  slug: "",
  slugTouched: false,
  contentId,
  createdAt: new Date().toISOString(),
  seoTitle: "",
  seoTitleEdited: false,
  seoDesc: "",
  seoDescEdited: false,
  primaryLanguage: "",
  originalLanguage: "",
  originalTouched: false,
  translations: [],
  flipbook: false,
  tags: [],
  seo: [],
  readingAge: "",
  ageRestricted: false,
  minAge: "",
  warning: "",
  territory: "worldwide",
  countries: [],
  availableFrom: "",
  availableUntil: "",
  access: "Subscribers Only",
  copyrightOwner: "",
  copyrightYear: String(new Date().getFullYear()),
  rightsNotes: "",
  mode: "now",
  publishDate: "",
  publishTime: "",
  promo: {},
});

/** Older saved drafts and titles predate some fields: keep what they typed, and treat it as a manual choice. */
const migrate = (
  saved: (Partial<EbookDraft> & { subscriberOnly?: boolean; mature?: boolean }) | undefined,
  base: EbookDraft,
  isNew: boolean,
): EbookDraft => {
  const { subscriberOnly, mature, ...rest } = saved ?? {};
  const d = { ...base, ...rest };
  // one age model: a minimum age means "restricted". "Mature" with no age is kept as a content warning instead of inventing an age.
  const hasAge = Number(d.minAge) > 0;
  const restricted = !!saved?.ageRestricted || hasAge;
  const warning =
    mature && !hasAge && !/mature/i.test(d.warning)
      ? [d.warning, "Mature themes"].filter(Boolean).join(", ")
      : d.warning;
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
    minAge: restricted ? (hasAge ? d.minAge : "18") : "",
    warning,
    mode,
    access: (saved?.access ??
      (subscriberOnly === undefined
        ? base.access
        : subscriberOnly
          ? "Subscribers Only"
          : "Public")) as Access,
    originalTouched: saved?.originalTouched ?? !!saved?.originalLanguage,
    seoTitleEdited: saved?.seoTitleEdited ?? !!saved?.seoTitle,
    seoDescEdited: saved?.seoDescEdited ?? !!saved?.seoDesc,
    contentId: saved?.contentId || base.contentId,
  };
};
const originalOf = (d: EbookDraft) => (d.originalTouched ? d.originalLanguage : d.primaryLanguage);

const EPUB: Rules = { exts: ["epub"], maxBytes: 200 * MB, kind: "doc", magic: "epub" };
const PDF: Rules = { exts: ["pdf"], maxBytes: 500 * MB, kind: "doc", magic: "pdf" };
const SAMPLE: Rules = { exts: ["epub", "pdf"], maxBytes: 100 * MB, kind: "doc" };
const up = (m?: { status: string }) => !!m && (m.status === "processing" || m.status === "ready");

function validateEbook(s: Snapshot<EbookDraft>): Record<string, string>[] {
  const { d, media, images } = s;
  const r = (c: unknown, id: string, o: Record<string, string>, msg = REQUIRED) => {
    if (!c) o[id] = msg;
  };
  const s1: Record<string, string> = {};
  r(d.title.trim(), "title", s1);
  r(d.author.trim(), "author", s1);
  r(d.summary.trim(), "summary", s1);
  r(d.fullDesc.trim(), "fullDesc", s1);
  r(d.genre, "genre", s1);
  const s2: Record<string, string> = {};
  r(d.primaryLanguage, "primaryLanguage", s2);
  d.translations.forEach((t) => r(t.language, `trlang-${t.id}`, s2, "Choose a language."));
  const s3: Record<string, string> = {};
  // at least one digital file is needed: EPUB or PDF, not both
  const epub = media["epub"];
  const pdf = media["pdf"];
  for (const [slot, m] of [
    ["epub", epub],
    ["pdf", pdf],
  ] as const) {
    if (m?.status === "error") s3[slot] = m.error ?? "Fix or replace this file.";
    else if (m && !up(m)) s3[slot] = "Wait for the upload to finish.";
  }
  if (!up(epub) && !up(pdf) && Object.keys(s3).length === 0)
    s3["epub"] = "At least one digital book file is required (EPUB or PDF).";
  d.translations
    .filter((t) => t.fileRequired)
    .forEach((t) => {
      if (!up(media[`tr:${t.id}:epub`]) && !up(media[`tr:${t.id}:pdf`]))
        s3[`tr:${t.id}:epub`] =
          `Upload an EPUB or PDF for the ${t.language || "translated"} edition.`;
    });
  const s4: Record<string, string> = {};
  for (const [slot, label] of [
    ["front", "Front cover"],
    ["thumb", "Thumbnail"],
  ] as const)
    r(imgOk(images[slot]), slot, s4, `${label} is required.`);
  d.translations
    .filter((t) => t.ownCover)
    .forEach((t) =>
      r(
        imgOk(images[`trcover:${t.id}`]),
        `trcover:${t.id}`,
        s4,
        `Cover for the ${t.language || "translated"} edition is required.`,
      ),
    );
  const s5: Record<string, string> = {};
  if (d.ageRestricted) {
    r(d.minAge, "minAge", s5);
    if (d.minAge && !(Number(d.minAge) >= 1 && Number(d.minAge) <= 99))
      s5["minAge"] = "Enter an age between 1 and 99.";
  }
  if (d.availableFrom && d.availableUntil && d.availableUntil < d.availableFrom)
    s5["availableUntil"] = "Available Until must be on or after Available From.";
  return [s1, s2, s3, s4, s5, {}];
}

function fromBook(b: Book): Snapshot<EbookDraft> {
  if (b.meta?.["wizard"]) {
    try {
      const saved = JSON.parse(b.meta["wizard"]) as Snapshot<EbookDraft>;
      return {
        ...saved,
        d: {
          ...migrate(saved.d, emptyDraft(b.cid ?? ""), false),
          contentId: b.cid ?? saved.d.contentId ?? "",
          createdAt: b.createdAt ?? saved.d.createdAt ?? "",
          promo: b.promo ?? saved.d.promo ?? {},
        },
      };
    } catch {
      /* use the basic mapping */
    }
  }
  const r = b.restrictions;
  const info = b.info;
  const d: EbookDraft = {
    ...emptyDraft(b.cid ?? ""),
    createdAt: b.createdAt ?? "",
    title: b.title,
    slug: b.slug,
    slugTouched: true,
    author: b.author,
    isbn: b.isbn,
    summary: b.description.slice(0, 250),
    fullDesc: b.description,
    genre: b.genre,
    pubDate: b.year > 0 ? `${b.year}-01-01` : "",
    pages: b.pages > 0 ? String(b.pages) : "",
    series: b.series ?? "",
    primaryLanguage: info?.language ?? "English",
    subtitle: info?.subtitle ?? "",
    publisher: info?.publisher ?? "",
    edition: info?.edition ?? "",
    readingAge: info?.readingAge ?? "",
    tags: info?.tags ?? [],
    translations: (info?.languages ?? [])
      .filter((l) => l !== (info?.language ?? "English"))
      .map((language) => ({
        id: uid(),
        language,
        translatedTitle: "",
        translator: "",
        fileRequired: false,
        ownCover: false,
      })),
    ageRestricted: !!r?.ageRestricted || !!r?.minAge,
    minAge: r?.minAge ? String(r.minAge) : r?.ageRestricted ? "18" : "",
    warning: r?.warnings?.join(", ") ?? "",
    access: r?.access ?? "Subscribers Only",
    territory: r?.territory ?? "worldwide",
    countries: r?.countries ?? [],
    availableFrom: r?.availableFrom ?? "",
    availableUntil: r?.availableUntil ?? "",
    mode: b.status === "Scheduled" ? "schedule" : b.status === "Archived" ? "archive" : "now",
    publishDate: b.publishAt?.slice(0, 10) ?? "",
    publishTime: b.publishAt?.slice(11, 16) ?? "",
    promo: b.promo ?? {},
  };
  const img = {
    name: b.cover ? "cover.jpg" : "generated-cover",
    size: 0,
    w: 1600,
    h: 2400,
    url: b.cover ?? "",
    fx: 0.5,
    fy: 0.5,
    ...(b.cover ? {} : { placeholder: true }),
  };
  return {
    d,
    media: {
      epub: {
        name: "existing-book.epub",
        size: 0,
        status: "ready",
        progress: 100,
        speed: 0,
        eta: 0,
        proc: 100,
      },
    },
    images: { front: img, back: img, spine: img, thumb: img },
  };
}

export function EbookWizard({
  existing,
  draftId,
  snapshot,
  restored,
}: {
  existing?: Book;
  draftId: string;
  snapshot?: Snapshot<EbookDraft>;
  restored?: { at: number; onDiscard: () => void };
}) {
  const navigate = useNavigate();
  const ebooks = useEbooks();
  const settings = useSettings();
  const genres = useGenreNames("eBook").slice(1);
  const drafts = useDrafts();
  const seq = useIdSeq();
  const initial: Snapshot<EbookDraft> = snapshot
    ? reviveSnapshot({
        ...snapshot,
        d: migrate(snapshot.d, emptyDraft(existing?.cid ?? ""), !existing),
      })
    : existing
      ? fromBook(existing)
      : {
          d: {
            ...emptyDraft(
              nextContentId(
                "EBK",
                [
                  ...ebooks.map((b) => b.cid),
                  ...drafts.map(
                    (x) => (x.snapshot as { d?: { contentId?: string } } | undefined)?.d?.contentId,
                  ),
                ],
                seq.EBK,
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

  /** Live mode: save through the real API (MySQL); every uploaded file is already verified in R2. */
  const finishLive = async (mode: PublishMode, s: Snapshot<EbookDraft>) => {
    const d = s.d;
    const busy = pendingUploads(s);
    if (busy.length)
      return void toast.warning(`${busy[0]}. Wait for it to finish, then try again.`);
    const failed = failedUploads(s);
    if (failed.length) return void toast.error(`Fix or remove this first: ${failed[0]}`);
    const publishing = mode === "now" || mode === "schedule";
    if (publishing && s.d.flipbook && !s.media["pdf"]?.assetId) return void toast.error("A flipbook is built from the PDF: upload a PDF, or turn the flipbook off.");
    if (publishing && !s.media["epub"]?.assetId && !s.media["pdf"]?.assetId)
      return void toast.error("Please upload an EPUB or PDF before publishing.");
    if (publishing && !(s.images["front"]?.assetId || s.images["front"]?.placeholder))
      return void toast.error("Please add a front cover before publishing.");
    try {
      await saveEbookLive(
        {
          c: {
            title: d.title,
            slug: d.slug,
            slugTouched: d.slugTouched,
            summary: d.summary,
            description: d.fullDesc || d.summary,
            releaseDate: d.pubDate,
            genres: [d.genre, d.subgenre],
            tags: d.tags,
            seoKeywords: d.seo,
            seoTitle: seoTitleOf(d),
            seoDesc: seoDescOf(d, d.summary),
            primaryLanguage: d.primaryLanguage,
            originalLanguage: originalOf(d),
            ageRating: d.readingAge,
            ageRestricted: d.ageRestricted,
            minAge: d.minAge,
            warnings: d.warning
              .split(",")
              .map((w) => w.trim())
              .filter(Boolean),
            territory: d.territory,
            countries: d.countries,
            availableFrom: d.availableFrom,
            availableUntil: d.availableUntil,
            access: d.access,
            promo: d.promo,
          },
          author: d.author,
          coAuthor: d.coAuthor,
          editor: d.editor,
          publisher: d.publisher,
          isbn: d.isbn,
          edition: d.edition,
          series: d.series,
          seriesNumber: d.seriesNumber,
          pubDate: d.pubDate,
          pages: d.pages,
          copyrightOwner: d.copyrightOwner,
          copyrightYear: d.copyrightYear,
          rightsNotes: d.rightsNotes,
          flipbook: d.flipbook && !!s.media["pdf"]?.assetId,
          translations: d.translations.map((t) => ({
            id: t.id,
            language: t.language,
            translatedTitle: t.translatedTitle,
            translator: t.translator,
          })),
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
      navigate({ to: "/admin/ebooks" });
    } catch (e) {
      toast.error(explain(e));
    }
  };

  const finish = (mode: PublishMode, s: Snapshot<EbookDraft>) => {
    if (!DEMO_MODE) return void finishLive(mode, s);
    const d = s.d;
    const title = d.title.trim();
    const status = statusFor(mode, d.availableFrom);
    const others = ebooks.filter((b) => b.slug !== existing?.slug).map((b) => b.slug);
    const typed = slugify(d.slug);
    // a slug the admin changed while editing is kept; a taken one gets a number
    const slug = existing
      ? typed && typed !== existing.slug
        ? uniqueSlug(typed, others)
        : existing.slug
      : uniqueSlug(typed || slugify(title), others);
    if (typed && slug !== typed && slug !== existing?.slug)
      toast.info(`That address was already used, so it was saved as "${slug}".`);
    const front = s.images["front"];
    const cover = imgOk(front) && front?.url ? front.url : undefined;
    const series = [d.series, d.seriesNumber && `#${d.seriesNumber}`].filter(Boolean).join(" ");
    const publishAt = mode === "schedule" ? scheduledAt(d.publishDate, d.publishTime) : undefined;
    const now = new Date().toISOString();
    const languages = [d.primaryLanguage, ...d.translations.map((t) => t.language)].filter(Boolean);
    const book: Book = {
      slug,
      title,
      author: d.author.trim(),
      genre: d.genre || "Fiction",
      rating: existing?.rating ?? 0,
      reviews: existing?.reviews ?? 0,
      pages: Number(d.pages) || existing?.pages || 0,
      year: Number(d.pubDate.slice(0, 4)) || existing?.year || 0,
      ...(series ? { series } : {}),
      description: d.fullDesc.trim() || d.summary.trim(),
      palette: existing?.palette ?? seedEbooks[ebooks.length % seedEbooks.length]!.palette,
      motif:
        existing?.motif ??
        (["sun", "line", "circle", "grid", "wave", "triangle"] as const)[ebooks.length % 6]!,
      status,
      isbn: d.isbn,
      count: existing?.count ?? 0,
      ...(cover ? { cover } : existing?.cover ? { cover: existing.cover } : {}),
      meta: pruned<Record<string, string>>({
        "Publication Date": d.pubDate || undefined,
        Language: d.primaryLanguage,
        "Copyright Owner": d.copyrightOwner.trim() || undefined,
        "Copyright Year": d.copyrightYear || undefined,
        "Rights Notes": d.rightsNotes.trim() || undefined,
        "SEO Title": seoTitleOf(d).trim() || undefined,
        "SEO Description": seoDescOf(d, d.summary).trim() || undefined,
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
        warnings: d.warning.trim() ? [d.warning.trim()] : undefined,
      }),
      info: pruned({
        language: d.primaryLanguage || undefined,
        languages: languages.length ? languages : undefined,
        publisher: d.publisher.trim() || undefined,
        subtitle: d.subtitle.trim() || undefined,
        edition: d.edition.trim() || undefined,
        readingAge: d.readingAge.trim() || undefined,
        tags: d.tags.length ? d.tags : undefined,
      }),
      ...(publishAt ? { publishAt } : {}),
    };
    update((st) => ({
      ebooks: existing
        ? st.ebooks.map((x) => (x.slug === existing.slug ? book : x))
        : [book, ...st.ebooks],
    }));
    if (!existing && status === "Published" && settings.notifyNew) {
      update((st) => ({
        announcements: [
          {
            id: Date.now(),
            kind: "New Release",
            t: `New on StreamVerse: ${title}`,
            s: "A new eBook just landed",
            at: Date.now(),
          },
          ...st.announcements,
        ],
      }));
    }
    reserveContentId(book.cid ?? "");
    if (existing && slug !== existing.slug) {
      // the title moved to a new address: lists, banners and customers' saved items follow it
      renameSlugInCatalog("eBook", existing.slug, slug);
      renameUserSlug("eBook", existing.slug, slug);
    }
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
    navigate({ to: "/admin/ebooks" });
  };

  const steps: StepDef<EbookDraft>[] = [
    {
      id: "basic",
      title: "Basic info",
      desc: "Title, author, summary",
      validate: (s) => validateEbook(s)[0]!,
      render: () => (
        <BasicStep
          genres={genres}
          status={existing?.status ?? "Draft"}
          updatedAt={existing?.updatedAt}
          isNew={!existing}
        />
      ),
    },
    {
      id: "lang",
      title: "Language & tags",
      desc: "Translations and keywords",
      validate: (s) => validateEbook(s)[1]!,
      render: () => <LanguageStep />,
    },
    {
      id: "files",
      title: "Book files",
      desc: "EPUB, PDF, sample",
      validate: (s) => validateEbook(s)[2]!,
      render: () => <FilesStep />,
    },
    {
      id: "covers",
      title: "Cover & banners",
      desc: "Covers and banners",
      validate: (s) => validateEbook(s)[3]!,
      render: () => <CoversStep />,
    },
    {
      id: "restrict",
      title: "Restrictions",
      desc: "Audience, territory, dates",
      validate: (s) => validateEbook(s)[4]!,
      render: () => <RestrictStep />,
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
      draft={{ id: draftId, type: "eBook" }}
      initial={initial}
      steps={steps}
      titleOf={(d) => d.title.trim()}
      restored={restored}
      eyebrow={existing ? "StreamVerse / Edit eBook" : "StreamVerse / Add eBook"}
      title={existing ? `Edit ${existing.title}` : "Add new eBook"}
      sub="Metadata first, files later. Languages are chosen once and reused for files and covers."
      backTo="/admin/ebooks"
      onSaveDraft={(s, goTo) => {
        if (!s.d.title.trim()) {
          goTo(0);
          toast.warning("Add a title before saving a draft.");
          return;
        }
        finish("draft", s);
      }}
    />
  );
}

function BasicStep({
  genres,
  status,
  updatedAt,
  isNew,
}: {
  genres: string[];
  status: string;
  updatedAt?: string | undefined;
  isNew: boolean;
}) {
  const { d, set } = useWiz<EbookDraft>();
  const f =
    <K extends keyof EbookDraft>(k: K) =>
    (v: EbookDraft[K]) =>
      set((x) => ({ ...x, [k]: v }));
  return (
    <>
      <SystemPanel
        contentId={d.contentId || "Assigned when saved"}
        created={d.createdAt ? fmtDay(d.createdAt) : "Not available"}
        updated={isNew ? fmtDay(d.createdAt) : updatedAt ? fmtDay(updatedAt) : "Not available"}
        status={status}
      />
      <Section title="Title & author">
        <TextBox
          id="title"
          label="Title"
          required
          value={d.title}
          onChange={(v) =>
            set((x) => ({ ...x, title: v, slug: x.slugTouched ? x.slug : slugOf(v) }))
          }
        />
        <TextBox id="author" label="Author" required value={d.author} onChange={f("author")} />
      </Section>
      <Section title="Description">
        <TextBox
          id="summary"
          label="Summary"
          required
          value={d.summary}
          onChange={f("summary")}
          maxLength={300}
          count={`${d.summary.length} / 300`}
          hint="Shown on cards and at the top of the book page."
        />
        <RichText
          id="fullDesc"
          label="Full Description"
          required
          value={d.fullDesc}
          onChange={f("fullDesc")}
        />
      </Section>
      <Section title="Genre">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectBox2
            id="genre"
            label="Genre"
            required
            value={d.genre}
            onChange={f("genre")}
            options={genres}
          />
        </div>
      </Section>
      <Advanced
        title="Advanced details"
        desc="Optional. People, publication details and series."
        defaultOpen={
          !!(
            d.subtitle ||
            d.coAuthor ||
            d.editor ||
            d.publisher ||
            d.isbn ||
            d.edition ||
            d.series ||
            d.pubDate ||
            d.pages ||
            d.subgenre
          )
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextBox
            id="subtitle"
            label="Subtitle"
            optional
            value={d.subtitle}
            onChange={f("subtitle")}
          />
          <TextBox
            id="coAuthor"
            label="Co-Author"
            optional
            value={d.coAuthor}
            onChange={f("coAuthor")}
          />
          <TextBox id="editor" label="Editor" optional value={d.editor} onChange={f("editor")} />
          <TextBox
            id="publisher"
            label="Publisher"
            optional
            value={d.publisher}
            onChange={f("publisher")}
          />
          <TextBox
            id="subgenre"
            label="Subgenre"
            optional
            value={d.subgenre}
            onChange={f("subgenre")}
          />
          <TextBox
            id="isbn"
            label="ISBN"
            optional
            value={d.isbn}
            onChange={f("isbn")}
            placeholder="978-…"
            hint="Leave blank if there isn't one. The Internal Content ID is used instead."
          />
          <TextBox
            id="edition"
            label="Edition"
            optional
            value={d.edition}
            onChange={f("edition")}
          />
          <TextBox
            id="pubDate"
            label="Publication Date"
            type="date"
            optional
            value={d.pubDate}
            onChange={f("pubDate")}
          />
          <TextBox
            id="pages"
            label="Page Count"
            type="number"
            optional
            value={d.pages}
            onChange={f("pages")}
          />
          <TextBox id="series" label="Series" optional value={d.series} onChange={f("series")} />
          {d.series.trim() && (
            <TextBox
              id="seriesNumber"
              label="Series Number"
              type="number"
              optional
              value={d.seriesNumber}
              onChange={f("seriesNumber")}
            />
          )}
        </div>
      </Advanced>
    </>
  );
}

function LanguageStep() {
  const { d, set } = useWiz<EbookDraft>();
  const patch = (id: string, p: Partial<Translation>) =>
    set((x) => ({
      ...x,
      translations: x.translations.map((t) => (t.id === id ? { ...t, ...p } : t)),
    }));
  return (
    <>
      <Section title="Language">
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
      </Section>
      <Section
        title="Available translations"
        desc="Translated files are uploaded in the next step. Nothing is uploaded here."
        action={
          <Btn
            type="button"
            onClick={() =>
              set((x) => ({
                ...x,
                translations: [
                  ...x.translations,
                  {
                    id: uid(),
                    language: "",
                    translatedTitle: "",
                    translator: "",
                    fileRequired: true,
                    ownCover: false,
                  },
                ],
              }))
            }
          >
            <Plus /> ADD TRANSLATION
          </Btn>
        }
      >
        {d.primaryLanguage && (
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-semibold">
            {d.primaryLanguage} <span className="font-normal text-muted-foreground">— Primary</span>
          </div>
        )}
        {d.translations.length === 0 && (
          <Hint>No translations. English remains the primary edition.</Hint>
        )}
        {d.translations.map((t) => (
          <div
            key={t.id}
            className="grid gap-3 rounded-md border border-border bg-surface-2 p-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]"
          >
            <SearchSelect
              id={`trlang-${t.id}`}
              label="Language"
              value={t.language}
              onChange={(v) => patch(t.id, { language: v })}
              options={LANGUAGES.filter((n) => n !== d.primaryLanguage)}
            />
            <TextBox
              id={`trtitle-${t.id}`}
              label="Translated Title"
              optional
              value={t.translatedTitle}
              onChange={(v) => patch(t.id, { translatedTitle: v })}
            />
            <TextBox
              id={`trname-${t.id}`}
              label="Translator Name"
              optional
              value={t.translator}
              onChange={(v) => patch(t.id, { translator: v })}
            />
            <div className="flex items-end pb-2">
              <Switch
                checked={t.fileRequired}
                onChange={(v) => patch(t.id, { fileRequired: v })}
                label="File Required"
              />
            </div>
            <button
              type="button"
              aria-label="Remove translation"
              className="mt-6 grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text"
              onClick={() =>
                set((x) => ({ ...x, translations: x.translations.filter((r) => r.id !== t.id) }))
              }
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </Section>
      <Section title="Tags" desc="Shown to customers and used for discovery.">
        <TagInput
          id="tags"
          label="Tags & Keywords"
          optional
          values={d.tags}
          onChange={(v) => set((x) => ({ ...x, tags: v }))}
          noun="tags"
          placeholder="e.g. Fantasy, Magic, Coming of Age"
        />
      </Section>
      <SeoSection d={d} set={set} summary={d.summary} path="ebooks" />
    </>
  );
}

/**
 * "Flipbook version": customers get one more button on the book's page that opens a page-turning view (like a printed book)
 * made from the PDF. It needs a PDF, so the switch is explained instead of silently unavailable when there is none.
 */
function FlipbookOption() {
  const { d, set, media } = useWiz<EbookDraft>();
  const pdf = media["pdf"];
  const hasPdf = !!pdf && pdf.status !== "error";
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4" data-testid="flipbook-option">
      <Switch
        checked={d.flipbook && hasPdf}
        disabled={!hasPdf}
        onChange={(v) => set((x) => ({ ...x, flipbook: v }))}
        label="Offer a flipbook version"
      />
      <p className="mt-2 text-xs text-muted-foreground" data-testid="flipbook-hint">
        {hasPdf
          ? "Customers get an extra Flipbook button on this book's page: the PDF opens as pages that turn like a printed book."
          : "Upload a PDF above to turn this on. The flipbook is built from the PDF."}
      </p>
    </div>
  );
}

function FilesStep() {
  const { d } = useWiz<EbookDraft>();
  return (
    <>
      <Section
        title={`Primary edition${d.primaryLanguage ? ` · ${d.primaryLanguage}` : ""}`}
        desc="At least one digital book file is required: EPUB (recommended) or PDF. Formats are verified by file signature."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <MediaUploader
            slot="epub"
            label="EPUB"
            rules={EPUB}
            hint="Recommended"
            validNote="Valid EPUB"
          />
          <MediaUploader
            slot="pdf"
            label="PDF"
            optional
            rules={PDF}
            hint="Optional if an EPUB is uploaded"
            validNote="Valid PDF"
          />
        </div>
        <FlipbookOption />
        <MediaUploader
          slot="sample"
          label="Sample File"
          optional
          rules={SAMPLE}
          hint="A free sample chapter (EPUB or PDF)"
        />
      </Section>
      {d.translations
        .filter((t) => t.fileRequired)
        .map((t) => (
          <Section
            key={t.id}
            title={`${t.language || "Translated"} Edition`}
            desc={
              t.translatedTitle
                ? `${t.translatedTitle}${t.translator ? ` · translated by ${t.translator}` : ""}`
                : undefined
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <MediaUploader
                slot={`tr:${t.id}:epub`}
                label={`Upload EPUB (${t.language || "translation"})`}
                rules={EPUB}
                validNote="Valid EPUB"
              />
              <MediaUploader
                slot={`tr:${t.id}:pdf`}
                label={`Upload PDF (${t.language || "translation"})`}
                rules={PDF}
                validNote="Valid PDF"
              />
            </div>
          </Section>
        ))}
      {d.translations.some((t) => !t.fileRequired) && (
        <Hint>Translations marked “File Required: off” do not need files.</Hint>
      )}
    </>
  );
}

function CoversStep() {
  const { d, set } = useWiz<EbookDraft>();
  return (
    <>
      <Section
        title="Required covers"
        desc="Images are never stretched. Use Crop or the focal point to control framing."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ImageSlot slot="front" label="Front Cover" required rec={{ w: 1600, h: 2400 }} />
          <ImageSlot slot="thumb" label="Thumbnail" required rec={{ w: 400, h: 600 }} />
        </div>
      </Section>
      <Section
        title="More artwork"
        desc="All optional. StreamVerse shows digital books only, so the back cover, spine and full wrap are not needed to publish."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ImageSlot slot="back" label="Back Cover" optional rec={{ w: 1600, h: 2400 }} />
          <ImageSlot slot="spine" label="Spine" optional rec={{ w: 300, h: 1200 }} ratio={0.25} />
          <ImageSlot slot="wrap" label="Full Wrap Cover" optional rec={{ w: 3300, h: 2400 }} />
        </div>
      </Section>
      <Section
        title="Banners"
        desc="All optional. Used when this book is promoted on the homepage."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <ImageSlot slot="banner" label="Normal Banner" optional rec={{ w: 1280, h: 720 }} />
          <ImageSlot slot="hero" label="Featured Hero Banner" optional rec={{ w: 1920, h: 800 }} />
          <ImageSlot
            slot="latest"
            label="Latest Release Banner"
            optional
            rec={{ w: 1200, h: 628 }}
          />
        </div>
      </Section>
      {d.translations.length > 0 && (
        <Section
          title="Translated edition covers"
          desc="Turn on a separate cover only if an edition needs different artwork."
        >
          {d.translations.map((t) => (
            <div key={t.id} className="space-y-3 rounded-md border border-border bg-surface-2 p-3">
              <Switch
                checked={t.ownCover}
                onChange={(v) =>
                  set((x) => ({
                    ...x,
                    translations: x.translations.map((r) =>
                      r.id === t.id ? { ...r, ownCover: v } : r,
                    ),
                  }))
                }
                label={`Separate cover for the ${t.language || "translated"} edition`}
              />
              {t.ownCover && (
                <div className="max-w-xs">
                  <ImageSlot
                    slot={`trcover:${t.id}`}
                    label={`${t.language || "Translated"} front cover`}
                    required
                    rec={{ w: 1600, h: 2400 }}
                  />
                </div>
              )}
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function RestrictStep() {
  const { d, set } = useWiz<EbookDraft>();
  return <BookRestrictions d={d} set={set} />;
}

function PublishStep({
  finish,
  existing,
}: {
  finish: (m: PublishMode, s: Snapshot<EbookDraft>) => void;
  existing: boolean;
}) {
  const { d, set, snap, media, images, goTo } = useWiz<EbookDraft>();
  const all = validateEbook(snap);
  const ok = all.every((e) => Object.keys(e).length === 0);
  const territory =
    d.territory === "worldwide"
      ? "Worldwide"
      : `${d.territory === "selected" ? "Only in" : "Everywhere except"} ${d.countries.join(", ") || "(none chosen)"}`;
  return (
    <>
      <Section
        title="Required details"
        desc="Everything marked in red must be completed before this eBook can go live."
      >
        <Checklist
          items={[
            { label: "Title", ok: !all[0]!["title"], step: 0 },
            { label: "Author", ok: !all[0]!["author"], step: 0 },
            {
              label: "Summary & description",
              ok: !all[0]!["summary"] && !all[0]!["fullDesc"],
              step: 0,
            },
            { label: "Genre", ok: !all[0]!["genre"], step: 0 },
            { label: "Primary language", ok: !all[1]!["primaryLanguage"], step: 1 },
            {
              label: "A book file (EPUB or PDF)",
              ok: !all[2]!["epub"] && !all[2]!["pdf"],
              step: 2,
            },
            {
              label: "Translated editions' files",
              ok: Object.keys(all[2]!).filter((k) => k.startsWith("tr:")).length === 0,
              step: 2,
            },
            { label: "Front cover", ok: !all[3]!["front"], step: 3 },
            { label: "Thumbnail", ok: !all[3]!["thumb"], step: 3 },
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
            <Row k="Author" v={[d.author, d.coAuthor].filter(Boolean).join(", ")} />
            <Row k="Genre" v={[d.genre, d.subgenre].filter(Boolean).join(" / ")} />
            <Row k="ISBN" v={d.isbn} />
            <Row k="Pages" v={d.pages} />
          </ReviewSection>
          <ReviewSection
            title="Language & Translations"
            onEdit={() => goTo(1)}
            ok={!all[1]!["primaryLanguage"]}
          >
            <Row k="Primary" v={d.primaryLanguage} />
            <Row k="Original" v={originalOf(d)} />
            <Row
              k="Translations"
              v={d.translations
                .map((t) => t.language)
                .filter(Boolean)
                .join(", ")}
            />
            <Row k="Tags" v={d.tags.join(", ")} />
          </ReviewSection>
          <ReviewSection
            title="Book Files"
            onEdit={() => goTo(2)}
            ok={Object.keys(all[2]!).length === 0}
          >
            <Row
              k="EPUB"
              v={media["epub"] ? `${media["epub"].name} · ${fmtBytes(media["epub"].size)}` : ""}
            />
            <Row k="PDF" v={media["pdf"]?.name} />
            <Row k="Sample" v={media["sample"]?.name} />
          </ReviewSection>
          <ReviewSection
            title="Covers"
            onEdit={() => goTo(3)}
            ok={Object.keys(all[3]!).length === 0}
          >
            <Row k="Uploaded" v={Object.keys(images).join(", ")} />
          </ReviewSection>
          <ReviewSection title="Restrictions" onEdit={() => goTo(4)}>
            <Row k="Age rating" v={d.readingAge} />
            <Row k="Age restriction" v={d.ageRestricted ? `Minimum age ${d.minAge}` : "None"} />
            <Row k="Territory" v={territory} />
            <Row
              k="Available"
              v={[d.availableFrom, d.availableUntil].filter(Boolean).join(" → ")}
            />
            <Row k="Visibility" v={d.access} />
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
      <PromotionPanel promo={d.promo} onChange={(promo) => set((x) => ({ ...x, promo }))} />
      <PublishPanel
        mode={d.mode}
        onMode={(mode) => set((x) => ({ ...x, mode }))}
        publishDate={d.publishDate}
        publishTime={d.publishTime}
        onDate={(publishDate) => set((x) => ({ ...x, publishDate }))}
        onTime={(publishTime) => set((x) => ({ ...x, publishTime }))}
        ready={ok}
        noun="eBook"
        onGo={() => finish(d.mode, snap)}
        existing={existing}
      />
    </>
  );
}

export const emptyEbookDraft = emptyDraft;
