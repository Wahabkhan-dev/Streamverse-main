import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ebooks as seedEbooks, type Book, type Promo, type Restrictions } from "@/lib/data";
import { nextContentId } from "@/lib/content-id";
import { deleteDraft, useDrafts } from "@/lib/drafts";
import { renameSlugInCatalog, reserveContentId, slugify, update, useAudiobooks, useGenreNames, useIdSeq, useSettings } from "@/lib/store";
import { renameUserSlug } from "@/lib/user";
import { cn } from "@/lib/utils";
import { TagInput } from "./kit";
import { Btn, inputCls } from "../ui";
import { WizardShell, REQUIRED, reviveSnapshot, stripUrls, type StepDef } from "./engine";
import { Advanced, Checklist, DragHandle, FieldBox, GB, ImageSlot, imgOk, LANGUAGES, MB, MediaUploader, RadioCards, ReviewSection, RichText, Row, SearchSelect, Section, SelectBox2, Switch, SystemField, TextBox, fmtBytes, fmtDur, slugOf, uid, useReorder, useWiz, type Rules, type Snapshot } from "./kit";
import { BookRestrictions, Hint, PromotionPanel, PublishPanel, ReviewGroup, SeoSection, SystemPanel, SystemSummary, fmtDay, pruned, scheduledAt, seoDescOf, seoTitleOf, statusFor, uniqueSlug, type Access, type BookRestrictionFields, type PublishMode } from "./shared";

interface Edition { id: string; language: string; narrator: string; bio: string }
interface Chapter { id: string; title: string; duration: string; start: string; end: string }
export interface AudioDraft extends BookRestrictionFields {
  title: string; subtitle: string; author: string; publisher: string; isbn: string; series: string; seriesNumber: string; releaseDate: string; summary: string; fullDesc: string;
  genre: string; subgenre: string; /** manual override only; empty means "calculate from the audio" */ totalDuration: string; slug: string; slugTouched: boolean;
  /** system-generated, never typed */
  contentId: string; createdAt: string;
  seoTitle: string; seoTitleEdited: boolean; seoDesc: string; seoDescEdited: boolean;
  primaryLanguage: string; originalLanguage: string; originalTouched: boolean; narrator: string; narratorBio: string; editions: Edition[]; tags: string[]; seo: string[];
  thumbFromCover: boolean;
  chapterMode: "single" | "chapters"; chapters: Chapter[];
  mode: PublishMode; publishDate: string; publishTime: string; promo: Promo;
}

const emptyDraft = (contentId = ""): AudioDraft => ({
  title: "", subtitle: "", author: "", publisher: "", isbn: "", series: "", seriesNumber: "", releaseDate: "", summary: "", fullDesc: "", genre: "", subgenre: "", totalDuration: "", slug: "", slugTouched: false,
  contentId, createdAt: new Date().toISOString(),
  seoTitle: "", seoTitleEdited: false, seoDesc: "", seoDescEdited: false,
  primaryLanguage: "", originalLanguage: "", originalTouched: false, narrator: "", narratorBio: "", editions: [], tags: [], seo: [], thumbFromCover: false,
  chapterMode: "single", chapters: [{ id: uid(), title: "Chapter 1", duration: "", start: "", end: "" }],
  readingAge: "", ageRestricted: false, minAge: "", warning: "", territory: "worldwide", countries: [], availableFrom: "", availableUntil: "", access: "Subscribers Only",
  copyrightOwner: "", copyrightYear: String(new Date().getFullYear()), rightsNotes: "",
  mode: "now", publishDate: "", publishTime: "", promo: {},
});

/** Older saved drafts and titles predate some fields: keep what they typed, and treat it as a manual choice. */
const migrate = (saved: (Partial<AudioDraft> & { subscriberOnly?: boolean; mature?: boolean }) | undefined, base: AudioDraft, isNew: boolean): AudioDraft => {
  const { subscriberOnly, mature, ...rest } = saved ?? {};
  const d = { ...base, ...rest };
  // one age model: a minimum age means "restricted". "Mature" with no age is kept as a content warning instead of inventing an age.
  const hasAge = Number(d.minAge) > 0;
  const restricted = !!saved?.ageRestricted || hasAge;
  const warning = mature && !hasAge && !/mature/i.test(d.warning) ? [d.warning, "Mature themes"].filter(Boolean).join(", ") : d.warning;
  // Save as Draft and Archive are no longer publishing choices
  const mode: PublishMode = d.mode === "draft" || d.mode === "archive" || d.mode === "unset" ? (isNew ? "unset" : d.mode === "archive" ? "archive" : "now") : d.mode;
  return {
    ...d,
    ageRestricted: restricted,
    minAge: restricted ? (hasAge ? d.minAge : "18") : "",
    warning,
    mode,
    access: (saved?.access ?? (subscriberOnly === undefined ? base.access : subscriberOnly ? "Subscribers Only" : "Public")) as Access,
    originalTouched: saved?.originalTouched ?? !!saved?.originalLanguage,
    seoTitleEdited: saved?.seoTitleEdited ?? !!saved?.seoTitle,
    seoDescEdited: saved?.seoDescEdited ?? !!saved?.seoDesc,
    contentId: saved?.contentId || base.contentId,
  };
};
const originalOf = (d: AudioDraft) => (d.originalTouched ? d.originalLanguage : d.primaryLanguage);

const MASTER: Rules = { exts: ["mp3", "m4b", "wav"], maxBytes: 4 * GB, kind: "audio" };
const PREVIEW: Rules = { exts: ["mp3", "m4b", "wav"], maxBytes: 200 * MB, kind: "audio", minDur: 60, maxDur: 300 };
const up = (m?: { status: string }) => !!m && (m.status === "processing" || m.status === "ready");

/** "12:30", "1:02:03" or plain minutes -> seconds */
const parseDur = (t: string) => {
  const parts = t.trim().split(":").map(Number);
  if (!t.trim() || parts.some((n) => !isFinite(n))) return 0;
  if (parts.length === 1) return parts[0]! * 60;
  return parts.reduce((a, n) => a * 60 + n, 0);
};
const mmss = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/** "8h 30m" or "12:30" -> seconds */
const parseHuman = (t: string) => {
  const m = /^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*$/i.exec(t);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60;
  return parseDur(t);
};

interface Timing { start: number; end: number; secs: number }
type MediaMap = Snapshot<AudioDraft>["media"];
/**
 * Chapter times are worked out, not typed. One master file: the admin gives each chapter's start, and a chapter ends where the next begins.
 * Chapter files: each file's own length gives the duration, and chapters follow one another in order.
 */
function timings(d: AudioDraft, media: MediaMap): { rows: Timing[]; total: number } {
  if (d.chapterMode === "chapters") {
    let cur = 0;
    const rows = d.chapters.map((c) => {
      const secs = media[`ch:${c.id}`]?.duration ?? parseDur(c.duration);
      const row = { start: cur, end: cur + secs, secs };
      cur += secs;
      return row;
    });
    return { rows, total: cur };
  }
  const total = media["master"]?.duration ?? parseHuman(d.totalDuration);
  const starts = d.chapters.map((c, i) => (i === 0 ? 0 : parseDur(c.start)));
  const rows = starts.map((start, i) => {
    const end = i < starts.length - 1 ? starts[i + 1]! : total;
    return { start, end, secs: Math.max(0, end - start) };
  });
  return { rows, total };
}

function validateAudio(s: Snapshot<AudioDraft>): Record<string, string>[] {
  const { d, media, images } = s;
  const r = (c: unknown, id: string, o: Record<string, string>, msg = REQUIRED) => {
    if (!c) o[id] = msg;
  };
  const file = (slot: string, label: string, o: Record<string, string>) => {
    const m = media[slot];
    if (!m) o[slot] = `${label} is required.`;
    else if (m.status === "error") o[slot] = m.error ?? "Fix or replace this file.";
    else if (!up(m)) o[slot] = "Wait for the upload to finish.";
  };
  const s1: Record<string, string> = {};
  r(d.title.trim(), "title", s1);
  r(d.author.trim(), "author", s1);
  r(d.summary.trim(), "summary", s1);
  r(d.fullDesc.trim(), "fullDesc", s1);
  r(d.genre, "genre", s1);
  const s2: Record<string, string> = {};
  r(d.primaryLanguage, "primaryLanguage", s2);
  r(d.narrator.trim(), "narrator", s2);
  d.editions.forEach((e) => {
    r(e.language, `edlang-${e.id}`, s2, "Choose a language.");
  });
  const s3: Record<string, string> = {};
  // exactly one source: the master file, or the chapter files (checked with the chapters)
  if (d.chapterMode === "single") file("master", "The audiobook master file", s3);
  d.editions.forEach((e) => file(`ed:${e.id}`, `The ${e.language || "language edition"} audiobook`, s3));
  const s4: Record<string, string> = {};
  if (d.chapterMode === "chapters") {
    r(d.chapters.length > 0, "chapters", s4, "Add at least one chapter.");
    d.chapters.forEach((c) => {
      r(c.title.trim(), `chtitle-${c.id}`, s4);
      file(`ch:${c.id}`, "The chapter audio file", s4);
    });
  } else {
    // chapter markers are optional with one file; the times just have to run forward
    let prev = 0;
    d.chapters.forEach((c, i) => {
      const at = parseDur(c.start);
      if (i > 0 && c.start.trim() && at <= prev) s4[`chstart-${c.id}`] = "Start must be after the previous chapter.";
      if (i > 0 && c.start.trim()) prev = at;
    });
  }
  const s5: Record<string, string> = {};
  r(imgOk(images["cover"]), "cover", s5, "Cover is required.");
  r(imgOk(images["thumb"]) || (d.thumbFromCover && imgOk(images["cover"])), "thumb", s5, "Thumbnail is required.");
  const s6: Record<string, string> = {};
  if (d.ageRestricted) {
    r(d.minAge, "minAge", s6);
    if (d.minAge && !(Number(d.minAge) >= 1 && Number(d.minAge) <= 99)) s6["minAge"] = "Enter an age between 1 and 99.";
  }
  if (d.availableFrom && d.availableUntil && d.availableUntil < d.availableFrom) s6["availableUntil"] = "Available Until must be on or after Available From.";
  return [s1, s2, s3, s4, s5, s6, {}];
}

function fromAudio(b: Book): Snapshot<AudioDraft> {
  if (b.meta?.["wizard"]) {
    try {
      const saved = JSON.parse(b.meta["wizard"]) as Snapshot<AudioDraft>;
      return { ...saved, d: { ...migrate(saved.d, emptyDraft(b.cid ?? ""), false), contentId: b.cid ?? saved.d.contentId ?? "", createdAt: b.createdAt ?? saved.d.createdAt ?? "", promo: b.promo ?? saved.d.promo ?? {} } };
    } catch {
      /* use the basic mapping */
    }
  }
  const r = b.restrictions;
  const info = b.info;
  const d: AudioDraft = {
    ...emptyDraft(b.cid ?? ""),
    createdAt: b.createdAt ?? "",
    title: b.title, slug: b.slug, slugTouched: true, author: b.author, isbn: b.isbn, summary: b.description.slice(0, 250), fullDesc: b.description, genre: b.genre, releaseDate: `${b.year}-01-01`, totalDuration: b.duration ?? "", series: b.series ?? "",
    primaryLanguage: info?.language ?? "English", narrator: b.narrator ?? b.author, narratorBio: info?.narratorBio ?? "", publisher: info?.publisher ?? "", subtitle: info?.subtitle ?? "", readingAge: info?.readingAge ?? "", tags: info?.tags ?? [],
    editions: (info?.languages ?? []).filter((l) => l !== (info?.language ?? "English")).map((language) => ({ id: uid(), language, narrator: "", bio: "" })),
    chapters: info?.chapters?.length ? info.chapters.map((c) => ({ id: uid(), title: c.title, duration: c.duration, start: "", end: "" })) : emptyDraft().chapters,
    ageRestricted: !!r?.ageRestricted || !!r?.minAge, minAge: r?.minAge ? String(r.minAge) : r?.ageRestricted ? "18" : "", warning: r?.warnings?.join(", ") ?? "", access: r?.access ?? "Subscribers Only",
    territory: r?.territory ?? "worldwide", countries: r?.countries ?? [], availableFrom: r?.availableFrom ?? "", availableUntil: r?.availableUntil ?? "",
    mode: b.status === "Scheduled" ? "schedule" : b.status === "Archived" ? "archive" : "now",
    publishDate: b.publishAt?.slice(0, 10) ?? "", publishTime: b.publishAt?.slice(11, 16) ?? "", promo: b.promo ?? {},
  };
  const img = { name: b.cover ? "cover.jpg" : "generated-cover", size: 0, w: 1600, h: 1600, url: b.cover ?? "", fx: 0.5, fy: 0.5, ...(b.cover ? {} : { placeholder: true }) };
  return {
    d,
    media: { master: { name: "existing-audiobook.m4b", size: 0, status: "ready", progress: 100, speed: 0, eta: 0, proc: 100 } },
    images: { cover: img, thumb: img },
  };
}

export function AudiobookWizard({ existing, draftId, snapshot, restored }: { existing?: Book; draftId: string; snapshot?: Snapshot<AudioDraft>; restored?: { at: number; onDiscard: () => void } }) {
  const navigate = useNavigate();
  const audiobooks = useAudiobooks();
  const settings = useSettings();
  const genres = useGenreNames("Audiobook").slice(1);
  const drafts = useDrafts();
  const seq = useIdSeq();
  const initial: Snapshot<AudioDraft> = snapshot
    ? reviveSnapshot({ ...snapshot, d: migrate(snapshot.d, emptyDraft(existing?.cid ?? ""), !existing) })
    : existing
      ? fromAudio(existing)
      : {
          d: {
            ...emptyDraft(nextContentId("AUD", [...audiobooks.map((b) => b.cid), ...drafts.map((x) => (x.snapshot as { d?: { contentId?: string } } | undefined)?.d?.contentId)], seq.AUD)),
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

  const finish = (mode: PublishMode, s: Snapshot<AudioDraft>) => {
    const d = s.d;
    const title = d.title.trim();
    const status = statusFor(mode, d.availableFrom);
    const others = audiobooks.filter((b) => b.slug !== existing?.slug).map((b) => b.slug);
    const typed = slugify(d.slug);
    // a slug the admin changed while editing is kept; a taken one gets a number
    const slug = existing ? (typed && typed !== existing.slug ? uniqueSlug(typed, others) : existing.slug) : uniqueSlug(typed || slugify(title), others);
    if (typed && slug !== typed && slug !== existing?.slug) toast.info(`That address was already used, so it was saved as "${slug}".`);
    const timing = timings(d, s.media);
    const duration = d.totalDuration.trim() || (timing.total ? fmtDur(timing.total) : "") || existing?.duration || "";
    const now = new Date().toISOString();
    const coverImg = s.images["cover"];
    const cover = imgOk(coverImg) && coverImg?.url ? coverImg.url : undefined;
    const series = [d.series, d.seriesNumber && `#${d.seriesNumber}`].filter(Boolean).join(" ");
    const publishAt = mode === "schedule" ? scheduledAt(d.publishDate, d.publishTime) : undefined;
    const languages = [d.primaryLanguage, ...d.editions.map((e) => e.language)].filter(Boolean);
    const book: Book = {
      slug,
      title,
      author: d.author.trim(),
      narrator: d.narrator.trim() || d.author.trim(),
      ...(duration ? { duration } : {}),
      genre: d.genre || "Fiction",
      rating: existing?.rating ?? 0,
      reviews: existing?.reviews ?? 0,
      pages: existing?.pages ?? 0,
      year: Number(d.releaseDate.slice(0, 4)) || existing?.year || 0,
      ...(series ? { series } : {}),
      description: d.fullDesc.trim() || d.summary.trim(),
      palette: existing?.palette ?? seedEbooks[audiobooks.length % seedEbooks.length]!.palette,
      motif: existing?.motif ?? (["sun", "line", "circle", "grid", "wave", "triangle"] as const)[audiobooks.length % 6]!,
      status,
      isbn: d.isbn,
      count: existing?.count ?? 0,
      ...(cover ? { cover } : existing?.cover ? { cover: existing.cover } : {}),
      meta: pruned<Record<string, string>>({
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
      ...(existing ? (existing.createdAt ? { createdAt: existing.createdAt } : {}) : { createdAt: d.createdAt || now }),
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
        readingAge: d.readingAge.trim() || undefined,
        narratorBio: d.narratorBio.trim() || undefined,
        tags: d.tags.length ? d.tags : undefined,
        chapters: d.chapters.some((c) => c.title.trim()) ? d.chapters.flatMap((c, i) => (c.title.trim() ? [{ title: c.title.trim(), duration: timing.rows[i]?.secs ? mmss(timing.rows[i]!.secs) : "" }] : [])) : undefined,
      }),
      ...(publishAt ? { publishAt } : {}),
    };
    update((st) => ({ audiobooks: existing ? st.audiobooks.map((x) => (x.slug === existing.slug ? book : x)) : [book, ...st.audiobooks] }));
    if (!existing && status === "Published" && settings.notifyNew) {
      update((st) => ({ announcements: [{ id: Date.now(), kind: "New Release", t: `New on StreamVerse: ${title}`, s: "A new audiobook just landed", at: Date.now() }, ...st.announcements] }));
    }
    reserveContentId(book.cid ?? "");
    if (existing && slug !== existing.slug) {
      // the title moved to a new address: lists, banners and customers' saved items follow it
      renameSlugInCatalog("Audiobook", existing.slug, slug);
      renameUserSlug("Audiobook", existing.slug, slug);
    }
    deleteDraft(draftId);
    toast.success(mode === "draft" ? `${title} saved as draft` : mode === "archive" ? `${title} archived` : mode === "schedule" ? `${title} scheduled` : existing ? `${title} updated` : `${title} published`);
    navigate({ to: "/admin/audiobooks" });
  };

  const steps: StepDef<AudioDraft>[] = [
    { id: "basic", title: "Basic info", desc: "Title, author, summary", validate: (s) => validateAudio(s)[0]!, render: () => <BasicStep genres={genres} status={existing?.status ?? "Draft"} updatedAt={existing?.updatedAt} isNew={!existing} /> },
    { id: "lang", title: "Language, tags & narrator", desc: "Editions, narrators, keywords", validate: (s) => validateAudio(s)[1]!, render: () => <LanguageStep /> },
    { id: "audio", title: "Audio files", desc: "Master or chapter files, preview, editions", validate: (s) => validateAudio(s)[2]!, render: () => <AudioStep /> },
    { id: "chapters", title: "Chapters", desc: "Titles, start times, chapter files", validate: (s) => validateAudio(s)[3]!, render: () => <ChaptersStep /> },
    { id: "images", title: "Images & banners", desc: "Cover, thumbnail, banners", validate: (s) => validateAudio(s)[4]!, render: () => <ImagesStep /> },
    { id: "restrict", title: "Restrictions", desc: "Audience, territory, dates", validate: (s) => validateAudio(s)[5]!, render: () => <RestrictStep /> },
    { id: "publish", title: "Publish", desc: "Review and go live", validate: () => ({}), render: () => <PublishStep finish={finish} existing={!!existing} /> },
  ];

  return (
    <WizardShell
      draft={{ id: draftId, type: "Audiobook" }}
      initial={initial}
      steps={steps}
      titleOf={(d) => d.title.trim()}
      restored={restored}
      eyebrow={existing ? "StreamVerse / Edit audiobook" : "StreamVerse / Add audiobook"}
      title={existing ? `Edit ${existing.title}` : "Add new audiobook"}
      sub="Metadata first, files later. Language editions chosen once appear in every later step."
      backTo="/admin/audiobooks"
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

function BasicStep({ genres, status, updatedAt, isNew }: { genres: string[]; status: string; updatedAt?: string | undefined; isNew: boolean }) {
  const { d, set } = useWiz<AudioDraft>();
  const f = <K extends keyof AudioDraft>(k: K) => (v: AudioDraft[K]) => set((x) => ({ ...x, [k]: v }));
  return (
    <>
      <SystemPanel contentId={d.contentId || "Assigned when saved"} created={d.createdAt ? fmtDay(d.createdAt) : "Not available"} updated={isNew ? fmtDay(d.createdAt) : updatedAt ? fmtDay(updatedAt) : "Not available"} status={status} />
      <Section title="Title & author">
        <TextBox id="title" label="Title" required value={d.title} onChange={(v) => set((x) => ({ ...x, title: v, slug: x.slugTouched ? x.slug : slugOf(v) }))} />
        <TextBox id="author" label="Author" required value={d.author} onChange={f("author")} />
      </Section>
      <Section title="Description">
        <TextBox id="summary" label="Summary" required value={d.summary} onChange={f("summary")} maxLength={300} count={`${d.summary.length} / 300`} hint="Shown on cards and at the top of the audiobook page." />
        <RichText id="fullDesc" label="Full Description" required value={d.fullDesc} onChange={f("fullDesc")} />
      </Section>
      <Section title="Genre">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectBox2 id="genre" label="Genre" required value={d.genre} onChange={f("genre")} options={genres} />
        </div>
      </Section>
      <Advanced title="Advanced details" desc="Optional. Publication details and series." defaultOpen={!!(d.subtitle || d.publisher || d.isbn || d.subgenre || d.releaseDate || d.series)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextBox id="subtitle" label="Subtitle" optional value={d.subtitle} onChange={f("subtitle")} />
          <TextBox id="publisher" label="Publisher" optional value={d.publisher} onChange={f("publisher")} />
          <TextBox id="subgenre" label="Subgenre" optional value={d.subgenre} onChange={f("subgenre")} />
          <TextBox id="isbn" label="ISBN" optional value={d.isbn} onChange={f("isbn")} placeholder="978-…" hint="Leave blank if there isn't one. The Internal Content ID is used instead." />
          <TextBox id="releaseDate" label="Release Date" type="date" optional value={d.releaseDate} onChange={f("releaseDate")} />
          <TextBox id="series" label="Series" optional value={d.series} onChange={f("series")} />
          {d.series.trim() && <TextBox id="seriesNumber" label="Series Number" type="number" optional value={d.seriesNumber} onChange={f("seriesNumber")} />}
        </div>
      </Advanced>
    </>
  );
}

function LanguageStep() {
  const { d, set } = useWiz<AudioDraft>();
  const patch = (id: string, p: Partial<Edition>) => set((x) => ({ ...x, editions: x.editions.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
  return (
    <>
      <Section title="Language">
        <div className="grid gap-4 sm:grid-cols-2">
          <SearchSelect id="primaryLanguage" label="Primary Language" required value={d.primaryLanguage} onChange={(v) => set((x) => ({ ...x, primaryLanguage: v }))} options={LANGUAGES} />
          <SearchSelect id="originalLanguage" label="Original Language" optional value={originalOf(d)} onChange={(v) => set((x) => ({ ...x, originalLanguage: v, originalTouched: true }))} options={LANGUAGES} hint="Same as the primary language unless you change it." />
        </div>
      </Section>
      <Section title={`Primary narrator${d.primaryLanguage ? ` · ${d.primaryLanguage}` : ""}`}>
        <TextBox id="narrator" label="Narrator" required value={d.narrator} onChange={(v) => set((x) => ({ ...x, narrator: v }))} />
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <FieldBox id="narratorBio" label="Narrator Bio" optional>
            <textarea id="narratorBio" aria-label="Narrator Bio" rows={3} value={d.narratorBio} onChange={(e) => set((x) => ({ ...x, narratorBio: e.target.value }))} className={cn(inputCls, "h-auto py-2")} />
          </FieldBox>
          <ImageSlot slot="narrator" label="Narrator Image" optional rec={{ w: 400, h: 400 }} compact />
        </div>
      </Section>
      <Section title="Additional language editions" desc="Audio for each edition is uploaded in the next step." action={<Btn type="button" onClick={() => set((x) => ({ ...x, editions: [...x.editions, { id: uid(), language: "", narrator: "", bio: "" }] }))}><Plus /> ADD LANGUAGE EDITION</Btn>}>
        {d.editions.length === 0 && <Hint>No additional editions.</Hint>}
        {d.editions.map((e) => (
          <div key={e.id} className="space-y-3 rounded-md border border-border bg-surface-2 p-3">
            <div className="flex items-start gap-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <SearchSelect id={`edlang-${e.id}`} label="Language" required value={e.language} onChange={(v) => patch(e.id, { language: v })} options={LANGUAGES.filter((n) => n !== d.primaryLanguage)} />
                <TextBox id={`ednarr-${e.id}`} label="Narrator" optional value={e.narrator} onChange={(v) => patch(e.id, { narrator: v })} hint={d.narrator ? `Same as ${d.narrator} unless you enter someone else.` : undefined} />
              </div>
              <button type="button" aria-label="Remove edition" className="mt-6 grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text" onClick={() => set((x) => ({ ...x, editions: x.editions.filter((r) => r.id !== e.id) }))}>
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <FieldBox id={`edbio-${e.id}`} label="Narrator Bio" optional>
                <textarea aria-label="Narrator Bio" rows={3} value={e.bio} onChange={(ev) => patch(e.id, { bio: ev.target.value })} className={cn(inputCls, "h-auto py-2")} />
              </FieldBox>
              <ImageSlot slot={`ednarr:${e.id}`} label="Narrator Image" optional rec={{ w: 400, h: 400 }} compact />
            </div>
          </div>
        ))}
      </Section>
      <Section title="Tags" desc="Shown to customers and used for discovery.">
        <TagInput id="tags" label="Tags & Keywords" optional values={d.tags} onChange={(v) => set((x) => ({ ...x, tags: v }))} noun="tags" placeholder="e.g. Mystery, Thriller, Detective" />
      </Section>
      <SeoSection d={d} set={set} summary={d.summary} path="audiobooks" />
    </>
  );
}

function AudioStep() {
  const { d, set, media } = useWiz<AudioDraft>();
  const timing = timings(d, media);
  const [manual, setManual] = useState(!!d.totalDuration);
  const single = d.chapterMode === "single";
  // the browser could not read the length of the uploaded file: say so and offer a manual entry, never a made-up value
  const master = media["master"];
  const detectFailed = single && up(master) && master?.duration === undefined && !d.totalDuration.trim();
  const showManual = manual || !!d.totalDuration.trim();
  return (
    <>
      <Section title="How is this audiobook delivered?" desc="Choose one. You never need to upload both.">
        <RadioCards
          name="chapter-mode"
          value={d.chapterMode}
          onChange={(chapterMode) => set((x) => ({ ...x, chapterMode }))}
          options={[
            { value: "single", title: "Single audiobook file", desc: "One file; chapters are optional markers" },
            { value: "chapters", title: "Chapter files", desc: "Upload one audio file per chapter" },
          ]}
        />
      </Section>
      <Section title="Primary audiobook" desc={single ? "One complete audiobook file." : "Chapter files are uploaded in the next step, so there is no master file to upload."}>
        {single ? <MediaUploader slot="master" label="Primary Audiobook Master File" required big rules={MASTER} hint="MP3, M4B or WAV" /> : <Hint>Each chapter's audio file is added in Chapters.</Hint>}
        <div className="grid gap-4 sm:grid-cols-2">
          <SystemField
            label="Total Duration"
            value={d.totalDuration.trim() ? d.totalDuration : timing.total ? fmtDur(timing.total) : detectFailed ? "Unable to detect duration" : single ? "Calculated after the file is uploaded" : "Calculated from the chapter files"}
            note={d.totalDuration.trim() ? "Entered manually" : detectFailed ? "Not detected" : "Auto-calculated"}
          />
          <div className="flex items-end">
            {showManual ? (
              <TextBox id="totalDuration" label="Total Duration (manual)" optional value={d.totalDuration} onChange={(v) => set((x) => ({ ...x, totalDuration: v }))} placeholder="e.g. 8h 30m" className="w-full" hint="Used instead of the detected length." />
            ) : detectFailed ? (
              <Btn type="button" onClick={() => setManual(true)}>ENTER DURATION MANUALLY</Btn>
            ) : null}
          </div>
        </div>
        <MediaUploader slot="preview" label="Preview Audio" optional rules={PREVIEW} hint="1–5 minutes recommended" />
      </Section>
      {d.editions.map((e) => (
        <Section key={e.id} title={`${e.language || "Language"} Edition`} desc={e.narrator || d.narrator ? `Narrated by ${e.narrator || d.narrator}` : undefined}>
          <MediaUploader slot={`ed:${e.id}`} label={`Upload ${e.language || "language"} audiobook`} required rules={MASTER} />
        </Section>
      ))}
    </>
  );
}

function ChaptersStep() {
  const { d, set, media, errors, goTo } = useWiz<AudioDraft>();
  const reorder = useReorder(d.chapters, (chapters) => set((x) => ({ ...x, chapters })));
  const individual = d.chapterMode === "chapters";
  const patch = (id: string, p: Partial<Chapter>) => set((x) => ({ ...x, chapters: x.chapters.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const { rows, total } = timings(d, media);
  return (
    <>
      <Section title="Chapter source" desc={individual ? "Chapter files: each chapter has its own audio file." : "Single audiobook file: chapters are optional markers inside the master file."}>
        <p className="text-sm text-muted-foreground">
          Chosen in Audio files.{" "}
          <button type="button" className="font-semibold text-primary-text hover:underline" onClick={() => goTo(2)}>
            Change
          </button>
        </p>
      </Section>
      <Section title="Chapters" desc={individual ? "Add a number-ordered chapter, its title and its audio file. Times are calculated." : "Optional. Enter a title and where each chapter starts. Ends and durations are calculated."} action={<Btn type="button" onClick={() => set((x) => ({ ...x, chapters: [...x.chapters, { id: uid(), title: `Chapter ${x.chapters.length + 1}`, duration: "", start: "", end: "" }] }))}><Plus /> ADD CHAPTER</Btn>}>
        <div id="f-chapters" className="space-y-3">
          {errors["chapters"] && <p role="alert" className="text-[11px] font-medium text-primary-text">{errors["chapters"]}</p>}
          {d.chapters.map((c, i) => {
            const rd = reorder(i);
            const t = rows[i]!;
            return (
              <div key={c.id} {...rd.row} className="space-y-3 rounded-md border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex items-center gap-2 pt-7">
                    <DragHandle {...rd.handle} />
                    <span className="w-7 text-xs font-bold text-muted-foreground" aria-label={`Chapter number ${i + 1}`}>{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <TextBox id={`chtitle-${c.id}`} label="Chapter Title" required={individual} value={c.title} onChange={(v) => patch(c.id, { title: v })} className="min-w-48 flex-1" />
                  {individual ? (
                    <FieldBox id={`chstart-${c.id}`} label="Start Time" className="w-24">
                      <div className={cn(inputCls, "flex items-center text-muted-foreground")}>{mmss(t.start)}</div>
                    </FieldBox>
                  ) : i === 0 ? (
                    <FieldBox id={`chstart-${c.id}`} label="Start Time" className="w-24">
                      <div className={cn(inputCls, "flex items-center text-muted-foreground")}>0:00</div>
                    </FieldBox>
                  ) : (
                    <TextBox id={`chstart-${c.id}`} label="Start Time" value={c.start} onChange={(v) => patch(c.id, { start: v })} placeholder="mm:ss" className="w-24" />
                  )}
                  <FieldBox id={`chend-${c.id}`} label="End Time" className="w-24">
                    <div className={cn(inputCls, "flex items-center text-muted-foreground")}>{t.end ? mmss(t.end) : "-"}</div>
                  </FieldBox>
                  {individual && up(media[`ch:${c.id}`]) && media[`ch:${c.id}`]?.duration === undefined ? (
                    <TextBox id={`chdur-${c.id}`} label="Duration" value={c.duration} onChange={(v) => patch(c.id, { duration: v })} placeholder="mm:ss" className="w-28" hint="Unable to detect duration. Enter it manually." />
                  ) : (
                    <FieldBox id={`chdur-${c.id}`} label="Duration" className="w-24">
                      <div className={cn(inputCls, "flex items-center text-muted-foreground")}>{t.secs ? mmss(t.secs) : "-"}</div>
                    </FieldBox>
                  )}
                  <div className="flex items-end gap-1 pt-6">
                    <Btn type="button" size="sm" variant="ghost" aria-label="Move up" onClick={() => rd.move(-1)} disabled={i === 0}>↑</Btn>
                    <Btn type="button" size="sm" variant="ghost" aria-label="Move down" onClick={() => rd.move(1)} disabled={i === d.chapters.length - 1}>↓</Btn>
                    <button type="button" aria-label="Delete chapter" className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text" onClick={() => set((x) => ({ ...x, chapters: x.chapters.filter((r) => r.id !== c.id) }))}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {individual && <MediaUploader slot={`ch:${c.id}`} label="Audio File" required rules={MASTER} hint="Upload this chapter's audio (use Replace to swap it)" />}
              </div>
            );
          })}
        </div>
        {total > 0 && <p className="text-xs text-muted-foreground">Total running time: {fmtDur(total)}</p>}
      </Section>
    </>
  );
}

function ImagesStep() {
  const { d, set, images } = useWiz<AudioDraft>();
  const cover = images["cover"];
  return (
    <>
      <Section title="Required images" desc="Images are never stretched. Use Crop or the focal point to control framing.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ImageSlot slot="cover" label="Cover" required rec={{ w: 1600, h: 1600 }} />
          {d.thumbFromCover ? (
            <div id="f-thumb" className="scroll-mt-28 rounded-lg border border-border bg-surface-2 p-3">
              <div className="mb-2 text-xs font-semibold text-soft">
                Thumbnail <span className="text-primary-text">*</span> <span className="font-normal text-muted-foreground">· made from the cover</span>
              </div>
              {imgOk(cover) && cover?.url ? (
                <img src={cover.url} alt="Thumbnail preview from cover" className="aspect-square w-full max-w-48 rounded-md object-cover" style={{ objectPosition: `${(cover.fx ?? 0.5) * 100}% ${(cover.fy ?? 0.5) * 100}%` }} />
              ) : (
                <div className="grid aspect-square max-w-48 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">Add the cover first</div>
              )}
            </div>
          ) : (
            <ImageSlot slot="thumb" label="Thumbnail" required rec={{ w: 400, h: 400 }} />
          )}
        </div>
        <Switch checked={d.thumbFromCover} onChange={(v) => set((x) => ({ ...x, thumbFromCover: v }))} label="Use cover to generate thumbnail" />
      </Section>
      <Section title="Banners" desc="All optional. Used when this audiobook is promoted on the homepage.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ImageSlot slot="banner" label="Normal Banner" optional rec={{ w: 1280, h: 720 }} />
          <ImageSlot slot="hero" label="Featured Hero Banner" optional rec={{ w: 1920, h: 800 }} />
          <ImageSlot slot="latest" label="Latest Release Banner" optional rec={{ w: 1200, h: 628 }} />
        </div>
      </Section>
    </>
  );
}

function RestrictStep() {
  const { d, set } = useWiz<AudioDraft>();
  return <BookRestrictions d={d} set={set} />;
}

function PublishStep({ finish, existing }: { finish: (m: PublishMode, s: Snapshot<AudioDraft>) => void; existing: boolean }) {
  const { d, set, snap, media, images, goTo } = useWiz<AudioDraft>();
  const all = validateAudio(snap);
  const ok = all.every((e) => Object.keys(e).length === 0);
  const territory = d.territory === "worldwide" ? "Worldwide" : `${d.territory === "selected" ? "Only in" : "Everywhere except"} ${d.countries.join(", ") || "(none chosen)"}`;
  const m = media["master"];
  return (
    <>
      <Section title="Required details" desc="Everything marked in red must be completed before this audiobook can go live.">
        <Checklist
          items={[
            { label: "Title", ok: !all[0]!["title"], step: 0 },
            { label: "Author", ok: !all[0]!["author"], step: 0 },
            { label: "Summary & description", ok: !all[0]!["summary"] && !all[0]!["fullDesc"], step: 0 },
            { label: "Genre", ok: !all[0]!["genre"], step: 0 },
            { label: "Primary language & narrator", ok: !all[1]!["primaryLanguage"] && !all[1]!["narrator"], step: 1 },
            { label: d.chapterMode === "single" ? "Master audio file" : "Chapter titles & audio files", ok: d.chapterMode === "single" ? !all[2]!["master"] : Object.keys(all[3]!).length === 0, step: d.chapterMode === "single" ? 2 : 3 },
            ...(d.editions.length ? [{ label: "Language edition files", ok: !Object.keys(all[2]!).some((k) => k.startsWith("ed:")), step: 2 }] : []),
            { label: "Cover", ok: !all[4]!["cover"], step: 4 },
            { label: "Thumbnail", ok: !all[4]!["thumb"], step: 4 },
          ]}
        />
      </Section>
      <ReviewGroup title="Optional details">
      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewSection title="Basic Information" onEdit={() => goTo(0)} ok={Object.keys(all[0]!).length === 0}>
          <Row k="Title" v={d.title} />
          <Row k="Author" v={d.author} />
          <Row k="Genre" v={[d.genre, d.subgenre].filter(Boolean).join(" / ")} />
          <Row k="Duration" v={d.totalDuration || (timings(d, media).total ? fmtDur(timings(d, media).total) : "")} />
        </ReviewSection>
        <ReviewSection title="Language & Narrator" onEdit={() => goTo(1)} ok={Object.keys(all[1]!).length === 0}>
          <Row k="Primary" v={d.primaryLanguage} />
          <Row k="Original" v={originalOf(d)} />
          <Row k="Narrator" v={d.narrator} />
          <Row k="Editions" v={d.editions.map((e) => `${e.language} (${e.narrator || d.narrator})`).join(", ")} />
          <Row k="Tags" v={d.tags.join(", ")} />
        </ReviewSection>
        <ReviewSection title="Audio Files" onEdit={() => goTo(2)} ok={Object.keys(all[2]!).length === 0}>
          <Row k="Master" v={m ? `${m.name} · ${fmtBytes(m.size)}` : d.chapterMode === "chapters" ? "Using chapter files" : ""} />
          <Row k="Preview" v={media["preview"]?.name} />
        </ReviewSection>
        <ReviewSection title="Chapters" onEdit={() => goTo(3)} ok={Object.keys(all[3]!).length === 0}>
          <Row k="Delivery" v={d.chapterMode === "single" ? "Single audiobook file" : "Chapter files"} />
          <Row k="Chapters" v={d.chapters.some((c) => c.title.trim()) ? `${d.chapters.filter((c) => c.title.trim()).length}: ${d.chapters.map((c) => c.title).filter(Boolean).join(", ")}` : "None"} />
        </ReviewSection>
        <ReviewSection title="Images" onEdit={() => goTo(4)} ok={Object.keys(all[4]!).length === 0}>
          <Row k="Uploaded" v={Object.keys(images).join(", ")} />
        </ReviewSection>
        <ReviewSection title="Restrictions" onEdit={() => goTo(5)}>
          <Row k="Age rating" v={d.readingAge} />
          <Row k="Age restriction" v={d.ageRestricted ? `Minimum age ${d.minAge}` : "None"} />
          <Row k="Territory" v={territory} />
          <Row k="Visibility" v={d.access} />
        </ReviewSection>
      </div>
      </ReviewGroup>
      <SystemSummary contentId={d.contentId || "Assigned when saved"} created={d.createdAt ? fmtDay(d.createdAt) : "Not available"} slug={d.slug || slugOf(d.title)} status={d.mode === "now" ? "Draft until published" : d.mode === "schedule" ? "Draft until scheduled" : d.mode === "archive" ? "Archived" : "Draft"} />
      <PromotionPanel promo={d.promo} onChange={(promo) => set((x) => ({ ...x, promo }))} />
      <PublishPanel mode={d.mode} onMode={(mode) => set((x) => ({ ...x, mode }))} publishDate={d.publishDate} publishTime={d.publishTime} onDate={(publishDate) => set((x) => ({ ...x, publishDate }))} onTime={(publishTime) => set((x) => ({ ...x, publishTime }))} ready={ok} noun="audiobook" onGo={() => finish(d.mode, snap)} existing={existing} />
    </>
  );
}
