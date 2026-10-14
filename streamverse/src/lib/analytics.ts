import type { Book, Movie } from "./data";
import { seeded } from "./runtime";

/**
 * Sample analytics for the admin screens. Values are generated from the chosen filters so the charts
 * react to them, and are stable for the same filters. Real figures will come from the backend.
 */
export type RangeId = "7d" | "30d" | "90d" | "12m";
export type PeriodId = "Daily" | "Weekly" | "Monthly";
export type TypeId = "All" | "Movies" | "eBooks" | "Audiobooks";
export interface AnalyticsFilters {
  range: RangeId;
  type: TypeId;
  genre: string;
  period: PeriodId;
}
export const DEFAULT_FILTERS: AnalyticsFilters = { range: "30d", type: "All", genre: "All", period: "Daily" };
export const RANGES: { id: RangeId; label: string; days: number }[] = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "12m", label: "Last 12 months", days: 365 },
];
const STEP: Record<PeriodId, number> = { Daily: 1, Weekly: 7, Monthly: 30 };

export interface Point {
  label: string;
  [series: string]: number | string;
}

const DAY = 86_400_000;
const label = (t: number, period: PeriodId) => {
  const d = new Date(t);
  return period === "Monthly" ? d.toLocaleDateString(undefined, { month: "short" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Number of buckets for a range and granularity (at least 2 so a line can be drawn). */
export const pointCount = (f: Pick<AnalyticsFilters, "range" | "period">) => Math.max(2, Math.round(RANGES.find((r) => r.id === f.range)!.days / STEP[f.period]));

interface SeriesSpec {
  key: string;
  /** value at the end of the period */
  end: number;
  /** how much lower the start is (0.3 = starts 30% lower) */
  growth: number;
  /** cumulative (grows) or per-bucket (a rate) */
  cumulative: boolean;
}

/** One series per spec, scaled to the filters. */
export function buildSeries(f: AnalyticsFilters, specs: SeriesSpec[], factor = 1, endAt = Date.now()): Point[] {
  const n = pointCount(f);
  const days = RANGES.find((r) => r.id === f.range)!.days;
  const stepMs = (days / n) * DAY;
  const rnd = seeded(`analytics:${JSON.stringify(f)}:${specs.map((s) => s.key).join(",")}`);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = endAt - (n - 1 - i) * stepMs;
    const p: Point = { label: label(t, f.period) };
    for (const s of specs) {
      const progress = n === 1 ? 1 : i / (n - 1);
      const trend = 1 - s.growth * (1 - progress);
      const noise = 1 + (rnd() - 0.5) * 0.1;
      const scale = s.cumulative ? 1 : STEP[f.period] === 1 ? 1 / 30 : STEP[f.period] === 7 ? 7 / 30 : 1;
      p[s.key] = Math.max(0, Math.round(s.end * trend * noise * factor * scale));
    }
    out.push(p);
  }
  return out;
}

/** Genre filter scales every figure by that genre's share of the catalog. */
export function genreFactor(genre: string, movies: Movie[], books: Book[]): number {
  if (genre === "All") return 1;
  const hits = movies.filter((m) => m.genres.includes(genre)).length + books.filter((b) => b.genre === genre).length;
  const total = Math.max(1, movies.length + books.length);
  return Math.min(1, 0.12 + (hits / total) * 1.4);
}

export const sumOf = (pts: Point[], key: string) => pts.reduce((a, p) => a + Number(p[key] ?? 0), 0);
export const lastOf = (pts: Point[], key: string) => Number(pts[pts.length - 1]?.[key] ?? 0);

/** Percent change between the first and second half of a series. */
export function trendOf(pts: Point[], key: string): number {
  const h = Math.floor(pts.length / 2);
  const a = sumOf(pts.slice(0, h), key);
  const b = sumOf(pts.slice(pts.length - h), key);
  return a === 0 ? 0 : Math.round(((b - a) / a) * 1000) / 10;
}

export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(Math.round(n)));
export const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

/* ------------------------------------------------------------------ per-title stats */

export interface Share {
  label: string;
  pct: number;
}
export interface TitleStatsData {
  plays: number;
  unique: number;
  completionPct: number;
  /** average time spent per audience member, in minutes */
  avgMinutes: number;
  rating: number;
  reviews: number;
  listAdds: number;
  libraryAdds: number;
  series: Point[];
  funnel: Point[];
  countries: Share[];
  plans: Share[];
  devices: Share[];
  /** movie: qualities and subtitle languages; eBook: where readers stop; audiobook: listens by chapter and speeds */
  extra: { title: string; sub: string; kind: "bars" | "chart"; data: Share[]; chart?: Point[] }[];
}

/** Turns a handful of weights into percentages that add up to 100. */
function shares(labels: string[], rnd: () => number, skew = 1.6): Share[] {
  const raw = labels.map((_, i) => (rnd() + 0.25) * Math.pow(skew, labels.length - i));
  const sum = raw.reduce((a, n) => a + n, 0);
  let acc = 0;
  return labels.map((label, i) => {
    const pct = i === labels.length - 1 ? 100 - acc : Math.round((raw[i]! / sum) * 100);
    acc += pct;
    return { label, pct };
  });
}

const COUNTRY_POOL = ["United States", "United Kingdom", "India", "Canada", "Germany", "Japan", "Australia", "France", "Brazil", "Nigeria"];

/**
 * Sample audience figures for one published title. They scale with the title's real view / read /
 * listen count and the chosen range, so busier titles look busier. Real figures come from the backend.
 */
export function titleStats(type: "Movie" | "eBook" | "Audiobook", slug: string, total: number, range: RangeId, extras: { rating: number; reviews: number; chapters: number }): TitleStatsData {
  const rnd = seeded(`title:${slug}`);
  const days = RANGES.find((r) => r.id === range)!.days;
  const inRange = Math.round(total * Math.min(1, days / 180));
  const f: AnalyticsFilters = { range, period: days > 90 ? "Weekly" : "Daily", type: "All", genre: "All" };
  const series = buildSeries(f, [{ key: type === "Movie" ? "Views" : type === "eBook" ? "Reads" : "Listens", end: Math.max(0, total / 6), growth: 0.35, cumulative: false }]);

  const unique = Math.round(inRange * (0.55 + rnd() * 0.15));
  const completionPct = type === "Movie" ? Math.round(52 + rnd() * 30) : type === "eBook" ? Math.round(24 + rnd() * 30) : Math.round(30 + rnd() * 35);
  const avgMinutes = type === "Movie" ? Math.round(55 + rnd() * 50) : type === "eBook" ? Math.round(80 + rnd() * 120) : Math.round(140 + rnd() * 160);
  const labels = ["Started", "25%", "50%", "75%", "Finished"];
  const funnel: Point[] = labels.map((label, i) => ({ label, People: Math.round(unique * (i === 0 ? 1 : i === 4 ? completionPct / 100 : 1 - (i / 4) * (1 - completionPct / 100) * (1.15 + rnd() * 0.2))) }));

  const extra: TitleStatsData["extra"] = [];
  if (type === "Movie") {
    extra.push({ title: "Playback quality", sub: "Share of plays by resolution", kind: "bars", data: shares(["Auto", "1080p", "4K", "720p", "480p"], rnd, 1.45) });
    extra.push({ title: "Subtitle & audio language", sub: "Languages used while watching", kind: "bars", data: shares(["English", "Spanish", "French", "German", "Off"], rnd, 1.5) });
  } else if (type === "eBook") {
    const n = Math.max(2, extras.chapters);
    const stops = Array.from({ length: n }, (_, i) => ({ label: `Ch ${i + 1}`, Readers: Math.round(unique * Math.pow(0.9, i) * (0.9 + rnd() * 0.2)) }));
    extra.push({ title: "Where readers stop", sub: "Readers still reading at each chapter", kind: "chart", data: [], chart: stops });
    extra.push({ title: "Reader theme", sub: "Share of reading time by theme", kind: "bars", data: shares(["Dark", "Sepia", "Light"], rnd, 1.7) });
  } else {
    const n = Math.max(2, extras.chapters);
    const per = Array.from({ length: n }, (_, i) => ({ label: `Ch ${i + 1}`, Listeners: Math.round(unique * Math.pow(0.92, i) * (0.9 + rnd() * 0.2)) }));
    extra.push({ title: "Listeners by chapter", sub: "Listeners who reached each chapter", kind: "chart", data: [], chart: per });
    extra.push({ title: "Playback speed", sub: "Share of listening by speed", kind: "bars", data: shares(["1x", "1.25x", "1.5x", "0.75x", "2x"], rnd, 1.5) });
  }

  return {
    plays: inRange,
    unique,
    completionPct,
    avgMinutes,
    rating: extras.rating,
    reviews: extras.reviews,
    listAdds: Math.round(unique * (0.08 + rnd() * 0.06)),
    libraryAdds: Math.round(unique * (0.05 + rnd() * 0.05)),
    series,
    funnel,
    countries: shares(COUNTRY_POOL.slice(0, 5), rnd, 1.7),
    plans: shares(["Premium", "Standard", "Basic", "Free"], rnd, 1.55),
    devices: shares(["Web", "Mobile", "TV", "Tablet"], rnd, 1.5),
    extra,
  };
}

/** The platform's size in this sample world. The Users list shows a handful of these accounts. */
export const PLATFORM_USERS = 48_291;

/** Subscribers and monthly revenue, worked out from the active plans so every screen agrees. */
export function planTotals(plans: { price: number; interval: string; active: boolean; subs: number }[]) {
  const active = plans.filter((p) => p.active);
  return {
    subs: active.reduce((n, p) => n + p.subs, 0),
    revenue: Math.round(active.reduce((n, p) => n + p.subs * (p.interval === "Yearly" ? p.price / 12 : p.price), 0)),
  };
}
