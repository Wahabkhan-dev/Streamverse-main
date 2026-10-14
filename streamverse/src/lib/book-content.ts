import type { Book } from "./data";
import { runtimeSeconds, seeded } from "./runtime";

/**
 * Sample content for the reader and audiobook player. Real books and audio will replace this with
 * files delivered by the backend; the structure (chapters, pages, text) is what the screens expect.
 */
export interface Chapter {
  title: string;
  /** audiobooks: length in seconds */
  seconds: number;
  /** eBooks: first page of the chapter (1-based) */
  startPage: number;
  /** false when the admin never gave this chapter a length; `seconds` is then only a placeholder for the sample player */
  known?: boolean;
}

const TITLES = ["Arrival", "The Signal", "Low Tide", "Ashes", "Crossing", "The Map", "Silence", "Return", "Fracture", "Embers", "Daybreak", "Home"];

const parseDuration = (t: string) => {
  const parts = t.split(":").map(Number);
  if (parts.length > 1 && parts.every((n) => isFinite(n))) return parts.reduce((a, n) => a * 60 + n, 0);
  return runtimeSeconds(t, 0) || Number(t) * 60 || 0;
};

export function totalPagesOf(b: Book) {
  return Math.max(24, Math.min(b.pages, 400));
}

export function chaptersOf(b: Book): Chapter[] {
  const totalPages = totalPagesOf(b);
  const custom = b.info?.chapters?.filter((c) => c.title.trim());
  if (custom && custom.length) {
    const parsed = custom.map((c) => parseDuration(c.duration));
    const secs = parsed.map((n) => n || 1800);
    let page = 1;
    const per = Math.max(1, Math.floor(totalPages / custom.length));
    return custom.map((c, i) => {
      const ch = { title: c.title, seconds: secs[i]!, startPage: page, known: !!parsed[i] };
      page += per;
      return ch;
    });
  }
  const total = runtimeSeconds(b.duration, 8 * 3600);
  const rnd = seeded(`chapters:${b.slug}`);
  const weights = TITLES.map(() => 0.6 + rnd());
  const sum = weights.reduce((a, n) => a + n, 0);
  const per = Math.floor(totalPages / TITLES.length);
  return TITLES.map((t, i) => ({ title: `Chapter ${i + 1}: ${t}`, seconds: Math.round((weights[i]! / sum) * total), startPage: 1 + i * per }));
}

export const totalSecondsOf = (chapters: Chapter[]) => chapters.reduce((a, c) => a + c.seconds, 0);

/** Start of each chapter in seconds from the beginning of the book. */
export function chapterStarts(chapters: Chapter[]): number[] {
  let t = 0;
  return chapters.map((c) => {
    const s = t;
    t += c.seconds;
    return s;
  });
}

/** Which chapter holds a position, plus how far into that chapter it is. */
export function locate(chapters: Chapter[], seconds: number) {
  const starts = chapterStarts(chapters);
  let idx = 0;
  for (let i = 0; i < chapters.length; i++) if (seconds >= starts[i]!) idx = i;
  return { chapter: idx, into: Math.max(0, seconds - starts[idx]!) };
}

const SENTENCES = [
  "The harbour lights flickered against the long grey water, and for a moment nothing moved.",
  "She counted the steps again, as though the number might change if she was patient enough.",
  "No one had spoken about the letter, and that silence had begun to feel like a room of its own.",
  "Morning came slowly, the way it does when the night has been too honest.",
  "He kept the map folded in his coat, certain that the road it described no longer existed.",
  "There was a particular kind of quiet that came before the tide turned, and she had learned to trust it.",
  "Somewhere behind the wall a clock was keeping time for a house that had stopped listening.",
  "They walked until the streetlights thinned, until the city was only a warm smudge on the horizon.",
  "It was easier, he thought, to be brave on behalf of someone else.",
  "The window held the last of the light, and then, quite suddenly, it did not.",
  "Every answer opened a smaller door, and behind each door the same question waited, patient as stone.",
  "She laughed once, short and surprised, and the sound seemed to belong to someone younger.",
  "The old stories said the river remembered everything it had ever carried.",
  "He had expected fear. What arrived instead was a strange, steady clarity.",
  "Rain began without ceremony, tapping the glass like a hesitant visitor.",
  "None of it made sense yet, but the pieces had started to lean toward one another.",
  "Whatever happened next, she decided, she would meet it with her eyes open.",
  "The lantern swung once, twice, and settled, throwing a gold circle across the floorboards.",
  "He remembered the smell of salt and woodsmoke, and understood he was already home.",
  "Far off, a bell began to ring, and nobody could say who had set it moving.",
];

export interface PageContent {
  chapter: number;
  heading: string | undefined;
  paragraphs: string[];
}

/** Deterministic sample text for a page, so the same page always reads the same. */
export function pageContent(b: Book, page: number, chapters: Chapter[]): PageContent {
  let chapter = 0;
  for (let i = 0; i < chapters.length; i++) if (page >= chapters[i]!.startPage) chapter = i;
  const first = chapters[chapter]!.startPage === page;
  const rnd = seeded(`${b.slug}:${page}`);
  const paragraphs: string[] = [];
  const count = first ? 2 : 3;
  for (let p = 0; p < count; p++) {
    const n = 3 + Math.floor(rnd() * 3);
    const s: string[] = [];
    for (let k = 0; k < n; k++) s.push(SENTENCES[Math.floor(rnd() * SENTENCES.length)]!);
    paragraphs.push(s.join(" "));
  }
  if (page === 1) paragraphs.unshift(`${b.title} by ${b.author}. ${b.description}`);
  return { chapter, heading: first ? chapters[chapter]!.title : undefined, paragraphs };
}

export function searchBook(b: Book, query: string, chapters: Chapter[], limit = 40): { page: number; snippet: string }[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: { page: number; snippet: string }[] = [];
  const total = totalPagesOf(b);
  for (let page = 1; page <= total && out.length < limit; page++) {
    const text = pageContent(b, page, chapters).paragraphs.join(" ");
    const at = text.toLowerCase().indexOf(q);
    if (at >= 0) out.push({ page, snippet: `…${text.slice(Math.max(0, at - 40), at + q.length + 60)}…` });
  }
  return out;
}
