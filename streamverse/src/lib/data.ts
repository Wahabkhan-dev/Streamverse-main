import m1 from "@/assets/m1.jpg";
import m2 from "@/assets/m2.jpg";
import m3 from "@/assets/m3.jpg";
import m4 from "@/assets/m4.jpg";
import m5 from "@/assets/m5.jpg";
import m6 from "@/assets/m6.jpg";
import m7 from "@/assets/m7.jpg";
import m8 from "@/assets/m8.jpg";

/** Published is the only status customers can see. Unpublished is a title that was live and was taken down. */
export type Status = "Published" | "Draft" | "Scheduled" | "Unpublished" | "Archived";
export type ItemType = "Movie" | "eBook" | "Audiobook";
/**
 * A pointer to one catalog title. `id` is the title's stable reference (MOV-000001 ...) and is what the
 * link really means: a slug can be renamed, an id cannot. `slug` is kept for old saves and for display.
 */
export interface ItemRef {
  type: ItemType;
  slug: string;
  id?: string;
}

/** Who may see a title, and when. Captured by the admin wizard; enforced by the customer UI. */
export interface Restrictions {
  access?: "Public" | "Subscribers Only" | "Hidden";
  ageRestricted?: boolean;
  minAge?: number;
  territory?: "worldwide" | "selected" | "exclude";
  countries?: string[];
  availableFrom?: string;
  availableUntil?: string;
  warnings?: string[];
}
export interface Promo {
  featured?: boolean;
  trending?: boolean;
  popular?: boolean;
  newRelease?: boolean;
}
export interface MovieInfo {
  language?: string;
  audio?: string[];
  subtitles?: string[];
  director?: string;
  producer?: string;
  tags?: string[];
}
export interface BookInfo {
  language?: string;
  languages?: string[];
  publisher?: string;
  subtitle?: string;
  edition?: string;
  readingAge?: string;
  narratorBio?: string;
  tags?: string[];
  chapters?: { title: string; duration: string }[];
}

export interface Movie {
  slug: string;
  title: string;
  year: number;
  genres: string[];
  runtime: string;
  rating: string;
  badges: string[];
  description: string;
  image: string;
  status: Status;
  views: number;
  /** every field captured by the admin wizard, so a title can be re-edited losslessly */
  meta?: Record<string, string>;
  /** system-generated reference (MOV-000001), shown to admins only */
  cid?: string;
  createdAt?: string;
  updatedAt?: string;
  release: string;
  /** ISO date-time a scheduled title is due to go live (display only in the frontend phase) */
  publishAt?: string;
  promo?: Promo;
  restrictions?: Restrictions;
  info?: MovieInfo;
  cast: { name: string; role: string }[];
}

export interface Book {
  slug: string;
  title: string;
  author: string;
  narrator?: string;
  genre: string;
  rating: number;
  reviews: number;
  pages: number;
  duration?: string;
  year: number;
  series?: string;
  description: string;
  /** cover palette: [bg-from, bg-to, accent] as oklch strings */
  palette: [string, string, string];
  motif: "sun" | "line" | "circle" | "grid" | "wave" | "triangle";
  status: Status;
  isbn: string;
  count: number;
  /** uploaded front cover (data URL); the generated artwork is used when absent */
  cover?: string;
  meta?: Record<string, string>;
  /** system-generated reference (EBK-000001 / AUD-000001), shown to admins only */
  cid?: string;
  createdAt?: string;
  updatedAt?: string;
  publishAt?: string;
  promo?: Promo;
  restrictions?: Restrictions;
  info?: BookInfo;
}

const castPool = [
  ["Mara Okafor", "Commander Vale"],
  ["Julian Reyes", "Dr. Ilan Shaw"],
  ["Sofia Lindqvist", "Nadia"],
  ["Theo Marsh", "Kade"],
  ["Ren Nakamura", "Officer Tanaka"],
  ["Aria Bellamy", "Lena Cross"],
];
const cast = (o: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const [name, role] = castPool[(i + o) % castPool.length]!;
    return { name: name!, role: role! };
  });

const mv = (
  slug: string,
  title: string,
  year: number,
  genres: string[],
  runtime: string,
  rating: string,
  badges: string[],
  image: string,
  status: Status,
  views: number,
  description: string,
): Movie => ({
  slug,
  title,
  year,
  genres,
  runtime,
  rating,
  badges,
  image,
  status,
  views,
  description,
  release: `${year}-0${(views % 9) + 1}-1${views % 9}`,
  cast: cast(views % 6),
});

export const movies: Movie[] = [
  mv("crimson-horizon", "Crimson Horizon", 2026, ["Sci-Fi", "Adventure"], "2h 28m", "13+", ["4K", "HDR", "Dolby Atmos"], m1, "Published", 4821033, "Stranded on a dying world beneath a ringed giant, a lone survey commander must choose between the mission that brought her here and the signal calling her home."),
  mv("neon-requiem", "Neon Requiem", 2025, ["Thriller", "Drama"], "1h 56m", "16+", ["4K", "HDR"], m2, "Published", 3210554, "A burned-out detective follows a trail of rain-soaked clues through a city that never sleeps — and never forgets."),
  mv("the-last-crown", "The Last Crown", 2025, ["Adventure", "Action"], "2h 41m", "13+", ["4K"], m3, "Published", 2789012, "An exiled rider returns to the kingdom that cast him out, carrying a secret that could unite the realm or burn it to ash."),
  mv("velocity-zero", "Velocity Zero", 2026, ["Action", "Thriller"], "1h 49m", "16+", ["4K", "HDR"], m4, "Published", 5120983, "One night. One tunnel. One driver who has nothing left to lose."),
  mv("glass-quiet", "Glass Quiet", 2024, ["Drama", "Romance"], "1h 58m", "13+", ["HD"], m5, "Published", 987123, "High above a restless city, a pianist learns to listen to the silence between the notes."),
  mv("abyssal", "Abyssal", 2026, ["Sci-Fi", "Thriller"], "2h 07m", "16+", ["4K", "HDR"], m6, "Scheduled", 0, "Eleven kilometres down, the crew of the Meridian discovers they are not the deepest thing in the ocean."),
  mv("roman-summer", "Roman Summer", 2025, ["Comedy", "Romance"], "1h 44m", "All", ["4K"], m7, "Published", 1654320, "Two strangers, one rooftop, and a summer that refuses to go to plan."),
  mv("white-silence", "White Silence", 2024, ["Adventure", "Drama"], "2h 12m", "13+", ["4K", "HDR"], m8, "Draft", 0, "Under the aurora, an expedition team races a closing storm across a glacier that wants them gone."),
  mv("ember-protocol", "Ember Protocol", 2025, ["Action", "Sci-Fi"], "2h 03m", "16+", ["4K"], m1, "Published", 2101870, "A rogue engineer holds the code to a planet-wide shutdown — and three days to decide who deserves it."),
  mv("midnight-ledger", "Midnight Ledger", 2024, ["Thriller", "Drama"], "1h 52m", "16+", ["HD"], m2, "Archived", 732011, "An accountant uncovers a ledger that rewrites a city's history, one entry at a time."),
];

const bk = (
  slug: string,
  title: string,
  author: string,
  genre: string,
  palette: [string, string, string],
  motif: Book["motif"],
  extra: Partial<Book> = {},
): Book => ({
  slug,
  title,
  author,
  genre,
  palette,
  motif,
  rating: 4.2 + (title.length % 8) / 10,
  reviews: 1200 + title.length * 137,
  pages: 220 + title.length * 17,
  year: 2020 + (title.length % 6),
  description:
    "A sweeping, intimate story about the choices that define us — told with precision, warmth and a quiet, relentless momentum that makes it impossible to put down.",
  status: "Published",
  isbn: `978-1-${(4000 + title.length * 91).toString()}-${(100 + title.length).toString()}-2`,
  count: 12000 + title.length * 3311,
  ...extra,
});

const P = {
  red: ["oklch(0.35 0.14 27)", "oklch(0.15 0.03 27)", "oklch(0.92 0.02 80)"] as [string, string, string],
  ink: ["oklch(0.22 0.01 250)", "oklch(0.12 0 0)", "oklch(0.64 0.24 25)"] as [string, string, string],
  sand: ["oklch(0.78 0.06 75)", "oklch(0.55 0.08 55)", "oklch(0.18 0.01 50)"] as [string, string, string],
  teal: ["oklch(0.4 0.07 200)", "oklch(0.18 0.03 220)", "oklch(0.88 0.05 90)"] as [string, string, string],
  olive: ["oklch(0.45 0.06 120)", "oklch(0.2 0.03 120)", "oklch(0.93 0.03 95)"] as [string, string, string],
  bone: ["oklch(0.92 0.015 85)", "oklch(0.82 0.02 80)", "oklch(0.55 0.2 27)"] as [string, string, string],
  navy: ["oklch(0.3 0.08 260)", "oklch(0.14 0.03 260)", "oklch(0.8 0.12 75)"] as [string, string, string],
  rust: ["oklch(0.55 0.13 45)", "oklch(0.3 0.08 35)", "oklch(0.95 0.02 80)"] as [string, string, string],
};

export const ebooks: Book[] = [
  bk("the-quiet-tide", "The Quiet Tide", "Elena Marsh", "Fiction", P.teal, "wave", { series: "Coastline #1" }),
  bk("atomic-mornings", "Atomic Mornings", "David Chen", "Self Help", P.bone, "sun"),
  bk("ash-and-iron", "Ash & Iron", "R. K. Vance", "Fantasy", P.red, "triangle", { series: "The Forge Cycle #2" }),
  bk("the-founders-map", "The Founder's Map", "Priya Nair", "Business", P.ink, "grid"),
  bk("a-life-in-ink", "A Life in Ink", "Margaret Hale", "Biography", P.sand, "line"),
  bk("the-glass-orchard", "The Glass Orchard", "Tomas Ferreira", "Mystery", P.navy, "circle"),
  bk("letters-to-june", "Letters to June", "Clara Bennett", "Romance", P.rust, "sun"),
  bk("little-lantern", "Little Lantern", "Ava Moreno", "Children", P.olive, "circle"),
  bk("northern-lights", "Northern Lights", "Henrik Dahl", "Fiction", P.navy, "wave", { status: "Draft" }),
  bk("deep-focus", "Deep Focus", "Marcus Webb", "Self Help", P.ink, "line", { status: "Scheduled" }),
];

export const audiobooks: Book[] = [
  bk("echoes-of-mars", "Echoes of Mars", "Lena Ortiz", "Fiction", P.red, "circle", { narrator: "James Holloway", duration: "11h 42m" }),
  bk("the-calm-mind", "The Calm Mind", "Dr. Sana Iqbal", "Self Help", P.teal, "wave", { narrator: "Sana Iqbal", duration: "6h 15m" }),
  bk("kingdom-of-salt", "Kingdom of Salt", "Owen Pryce", "Fantasy", P.sand, "triangle", { narrator: "Fiona Grey", duration: "18h 03m" }),
  bk("the-long-game", "The Long Game", "Nadia Osei", "Business", P.ink, "grid", { narrator: "Marcus Bell", duration: "8h 27m" }),
  bk("midnight-in-lisbon", "Midnight in Lisbon", "Rafael Costa", "Mystery", P.navy, "sun", { narrator: "Ines Duarte", duration: "9h 50m" }),
  bk("born-to-run-far", "Born to Run Far", "Kip Wanjiru", "Biography", P.rust, "line", { narrator: "Daniel Kimani", duration: "10h 11m" }),
  bk("starlight-stories", "Starlight Stories", "Molly Finch", "Children", P.olive, "circle", { narrator: "Molly Finch", duration: "2h 40m" }),
  bk("a-summer-promise", "A Summer Promise", "Isla Rowe", "Romance", P.bone, "sun", { narrator: "Chloe Ward", duration: "7h 33m", status: "Draft" }),
];

export const movieGenres = ["All", "Action", "Adventure", "Drama", "Sci-Fi", "Thriller", "Comedy", "Romance"];
export const bookGenres = ["All", "Fiction", "Self Help", "Biography", "Business", "Children", "Fantasy", "Mystery", "Romance"];

export const users = [
  { id: "u1", name: "Alex Morgan", email: "alex@streamverse.tv", plan: "Premium", status: "Active", joined: "2025-03-14", last: "2 min ago", country: "United States" },
  { id: "u2", name: "Priya Shah", email: "priya.shah@mail.com", plan: "Standard", status: "Active", joined: "2025-06-02", last: "1 hr ago", country: "India" },
  { id: "u3", name: "Daniel Okoro", email: "d.okoro@mail.com", plan: "Premium", status: "Active", joined: "2025-08-21", last: "Yesterday", country: "Nigeria" },
  { id: "u4", name: "Mia Laurent", email: "mia.l@mail.com", plan: "Basic", status: "Suspended", joined: "2024-11-09", last: "12 days ago", country: "France" },
  { id: "u5", name: "Kenji Watanabe", email: "kenji@mail.com", plan: "Premium", status: "Active", joined: "2026-01-17", last: "3 hrs ago", country: "Japan" },
  { id: "u6", name: "Sara Lindholm", email: "sara.l@mail.com", plan: "Free", status: "Inactive", joined: "2025-02-28", last: "2 months ago", country: "Sweden" },
  { id: "u7", name: "Omar Haddad", email: "omar.h@mail.com", plan: "Standard", status: "Active", joined: "2026-04-05", last: "5 min ago", country: "United Arab Emirates" },
  { id: "u8", name: "Lucy Grant", email: "lucy.grant@mail.com", plan: "Premium", status: "Active", joined: "2026-07-30", last: "Today", country: "United Kingdom" },
];

export const plans = [
  { name: "Basic", price: 6.99, interval: "Monthly", features: "HD movies, 1 screen", active: true, subs: 6210 },
  { name: "Standard", price: 12.99, interval: "Monthly", features: "Full HD, eBooks, 2 screens", active: true, subs: 10250 },
  { name: "Premium", price: 19.99, interval: "Monthly", features: "4K HDR, eBooks, Audiobooks, 4 screens", active: true, subs: 13980 },
  { name: "Premium Annual", price: 199, interval: "Yearly", features: "Everything in Premium, 2 months free", active: true, subs: 2400 },
];

export const payments = Array.from({ length: 12 }, (_, i) => ({
  id: `TXN-${(884210 + i * 37).toString()}`,
  user: users[i % users.length]!.name,
  plan: plans[i % plans.length]!.name,
  amount: plans[i % plans.length]!.price,
  currency: "USD",
  date: `2026-09-${String(28 - i).padStart(2, "0")}`,
  status: (["Succeeded", "Succeeded", "Pending", "Succeeded", "Failed", "Refunded"] as const)[i % 6]!,
}));

export const findMovie = (s: string) => movies.find((m) => m.slug === s);
export const findEbook = (s: string) => ebooks.find((m) => m.slug === s);
export const findAudiobook = (s: string) => audiobooks.find((m) => m.slug === s);
export const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);
