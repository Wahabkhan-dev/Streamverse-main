/**
 * Demo catalog seed — mirrors the frontend src/lib/data.ts sample data into MySQL.
 * Safe to run multiple times (idempotent: skips any slug that already exists).
 * No real media files are attached; records are created so catalog pages render.
 *
 * Run:   npm run seed:demo
 * Undo:  npm run seed:demo:delete
 */
import "dotenv/config";
import { prisma } from "../src/config/database";

type FEStatus = "Published" | "Draft" | "Scheduled" | "Archived";

function mapStatus(s: FEStatus) {
  const m: Record<FEStatus, "PUBLISHED" | "DRAFT" | "SCHEDULED" | "ARCHIVED"> = {
    Published: "PUBLISHED",
    Draft: "DRAFT",
    Scheduled: "SCHEDULED",
    Archived: "ARCHIVED",
  };
  return m[s];
}

function runtimeToMinutes(r: string): number {
  const h = r.match(/(\d+)h/);
  const m = r.match(/(\d+)m/);
  return (h ? parseInt(h[1]!) * 60 : 0) + (m ? parseInt(m[1]!) : 0);
}

/* ─── movies ─────────────────────────────────────────────────────────────────── */

const MOVIES: {
  slug: string; title: string; year: number; genres: string[]; runtime: string;
  rating: string; status: FEStatus; description: string; featured?: boolean;
  trending?: boolean; popular?: boolean; newRelease?: boolean;
}[] = [
  { slug: "crimson-horizon",  title: "Crimson Horizon",  year: 2026, genres: ["Sci-Fi","Adventure"], runtime: "2h 28m", rating: "13+", status: "Published", description: "Stranded on a dying world beneath a ringed giant, a lone survey commander must choose between the mission that brought her here and the signal calling her home.", featured: true, newRelease: true },
  { slug: "neon-requiem",     title: "Neon Requiem",     year: 2025, genres: ["Thriller","Drama"],    runtime: "1h 56m", rating: "16+", status: "Published", description: "A burned-out detective follows a trail of rain-soaked clues through a city that never sleeps — and never forgets.", trending: true },
  { slug: "the-last-crown",   title: "The Last Crown",   year: 2025, genres: ["Adventure","Action"],  runtime: "2h 41m", rating: "13+", status: "Published", description: "An exiled rider returns to the kingdom that cast him out, carrying a secret that could unite the realm or burn it to ash.", popular: true },
  { slug: "velocity-zero",    title: "Velocity Zero",    year: 2026, genres: ["Action","Thriller"],   runtime: "1h 49m", rating: "16+", status: "Published", description: "One night. One tunnel. One driver who has nothing left to lose.", trending: true, popular: true },
  { slug: "glass-quiet",      title: "Glass Quiet",      year: 2024, genres: ["Drama","Romance"],     runtime: "1h 58m", rating: "13+", status: "Published", description: "High above a restless city, a pianist learns to listen to the silence between the notes." },
  { slug: "abyssal",          title: "Abyssal",          year: 2026, genres: ["Sci-Fi","Thriller"],   runtime: "2h 07m", rating: "16+", status: "Scheduled", description: "Eleven kilometres down, the crew of the Meridian discovers they are not the deepest thing in the ocean.", newRelease: true },
  { slug: "roman-summer",     title: "Roman Summer",     year: 2025, genres: ["Comedy","Romance"],    runtime: "1h 44m", rating: "All", status: "Published", description: "Two strangers, one rooftop, and a summer that refuses to go to plan." },
  { slug: "white-silence",    title: "White Silence",    year: 2024, genres: ["Adventure","Drama"],   runtime: "2h 12m", rating: "13+", status: "Draft",     description: "Under the aurora, an expedition team races a closing storm across a glacier that wants them gone." },
  { slug: "ember-protocol",   title: "Ember Protocol",   year: 2025, genres: ["Action","Sci-Fi"],     runtime: "2h 03m", rating: "16+", status: "Published", description: "A rogue engineer holds the code to a planet-wide shutdown — and three days to decide who deserves it." },
  { slug: "midnight-ledger",  title: "Midnight Ledger",  year: 2024, genres: ["Thriller","Drama"],    runtime: "1h 52m", rating: "16+", status: "Archived",  description: "An accountant uncovers a ledger that rewrites a city's history, one entry at a time." },
];

/* ─── ebooks ─────────────────────────────────────────────────────────────────── */

const EBOOKS: {
  slug: string; title: string; author: string; genre: string;
  status: FEStatus; description: string; pages: number; isbn: string;
  series?: string;
}[] = [
  { slug: "the-quiet-tide",    title: "The Quiet Tide",    author: "Elena Marsh",    genre: "Fiction",   status: "Published", description: "A sweeping, intimate story about the choices that define us — told with precision, warmth and a quiet, relentless momentum.", pages: 334, isbn: "978-1-4560-387-2", series: "Coastline #1" },
  { slug: "atomic-mornings",   title: "Atomic Mornings",   author: "David Chen",     genre: "Self-Help", status: "Published", description: "Small deliberate habits compounded daily — a practical framework for building the life you keep meaning to start.", pages: 288, isbn: "978-1-4732-431-2" },
  { slug: "ash-and-iron",      title: "Ash & Iron",        author: "R. K. Vance",    genre: "Fantasy",   status: "Published", description: "A sweeping epic of forge-fire and fractured crowns. The second volume of The Forge Cycle.", pages: 512, isbn: "978-1-4641-476-2", series: "The Forge Cycle #2" },
  { slug: "the-founders-map",  title: "The Founder's Map", author: "Priya Nair",     genre: "Business",  status: "Published", description: "Every founder hits the same invisible walls. This is the map nobody gave you.", pages: 271, isbn: "978-1-4550-367-2" },
  { slug: "a-life-in-ink",     title: "A Life in Ink",     author: "Margaret Hale",  genre: "Biography", status: "Published", description: "A writer's memoir — from first notebook to final draft — told in sentences that refuse to waste a word.", pages: 398, isbn: "978-1-4459-376-2" },
  { slug: "the-glass-orchard", title: "The Glass Orchard", author: "Tomas Ferreira", genre: "Mystery",   status: "Published", description: "Three sisters inherit an estate. One of them did not survive the reading of the will.", pages: 322, isbn: "978-1-4668-385-2" },
  { slug: "letters-to-june",   title: "Letters to June",   author: "Clara Bennett",  genre: "Romance",   status: "Published", description: "A year of unsent letters between two people who should have said something sooner.", pages: 253, isbn: "978-1-4577-394-2" },
  { slug: "little-lantern",    title: "Little Lantern",    author: "Ava Moreno",     genre: "Children",  status: "Published", description: "A small light travels a very long way to find where it belongs.", pages: 186, isbn: "978-1-4586-403-2" },
  { slug: "northern-lights",   title: "Northern Lights",   author: "Henrik Dahl",    genre: "Fiction",   status: "Draft",     description: "A glaciologist returns to the research station where her mentor vanished thirty years ago.", pages: 361, isbn: "978-1-4595-412-2" },
  { slug: "deep-focus",        title: "Deep Focus",        author: "Marcus Webb",    genre: "Self-Help", status: "Scheduled", description: "Reclaim the long hours your attention span used to own.", pages: 240, isbn: "978-1-4604-421-2" },
];

/* ─── audiobooks ──────────────────────────────────────────────────────────────── */

const AUDIOBOOKS: {
  slug: string; title: string; author: string; narrator: string; genre: string;
  status: FEStatus; description: string; durationSeconds: number; isbn: string;
}[] = [
  { slug: "echoes-of-mars",     title: "Echoes of Mars",     author: "Lena Ortiz",     narrator: "James Holloway", genre: "Fiction",   status: "Published", description: "A colony ship's last transmission, replayed one fragment at a time by the daughter who never made the trip.", durationSeconds: 42120, isbn: "978-1-4560-111-2" },
  { slug: "the-calm-mind",      title: "The Calm Mind",      author: "Dr. Sana Iqbal", narrator: "Sana Iqbal",    genre: "Self-Help", status: "Published", description: "Eight weeks of guided practice — the clinical evidence, the science and the audio.", durationSeconds: 22500, isbn: "978-1-4560-222-2" },
  { slug: "kingdom-of-salt",    title: "Kingdom of Salt",    author: "Owen Pryce",     narrator: "Fiona Grey",     genre: "Fantasy",   status: "Published", description: "A tide-drowned world. A forgotten throne. A cartographer who cannot stop drawing the same coast.", durationSeconds: 64980, isbn: "978-1-4560-333-2" },
  { slug: "the-long-game",      title: "The Long Game",      author: "Nadia Osei",     narrator: "Marcus Bell",    genre: "Business",  status: "Published", description: "Why the companies that outlast everything else are built on decisions that hurt in the short run.", durationSeconds: 30420, isbn: "978-1-4560-444-2" },
  { slug: "midnight-in-lisbon", title: "Midnight in Lisbon", author: "Rafael Costa",   narrator: "Ines Duarte",    genre: "Mystery",   status: "Published", description: "A detective who quit. A city that doesn't forget. A missing person case from 1987 that refuses to stay cold.", durationSeconds: 35400, isbn: "978-1-4560-555-2" },
  { slug: "born-to-run-far",    title: "Born to Run Far",    author: "Kip Wanjiru",    narrator: "Daniel Kimani",  genre: "Biography", status: "Published", description: "From barefoot schoolboy to four-time world champion — the autobiography of the greatest long-distance runner alive.", durationSeconds: 36660, isbn: "978-1-4560-666-2" },
  { slug: "starlight-stories",  title: "Starlight Stories",  author: "Molly Finch",    narrator: "Molly Finch",    genre: "Children",  status: "Published", description: "Seven bedtime stories, each ending exactly where sleep begins.", durationSeconds: 9600,  isbn: "978-1-4560-777-2" },
  { slug: "a-summer-promise",   title: "A Summer Promise",   author: "Isla Rowe",      narrator: "Chloe Ward",     genre: "Romance",   status: "Draft",     description: "One summer. Two people. A promise neither of them planned to keep.", durationSeconds: 27180, isbn: "978-1-4560-888-2" },
];

/* ─── main ────────────────────────────────────────────────────────────────────── */

async function main() {
  console.log("StreamVerse — seeding demo catalog data...\n");

  // Fetch all seeded genres once (case-insensitive lookup by name)
  const allGenres = await prisma.genre.findMany();
  const genreMap = new Map(allGenres.map((g) => [g.name.toLowerCase(), g]));

  function findGenre(name: string) {
    return (
      genreMap.get(name.toLowerCase()) ??
      [...genreMap.values()].find((g) =>
        g.name.toLowerCase().includes(name.toLowerCase().replace(/-/g, " ").split(" ")[0]!)
      )
    );
  }

  /* ── movies ── */
  let movieSeeded = 0;
  for (const m of MOVIES) {
    const existing = await prisma.content.findUnique({ where: { slug: m.slug } });
    if (existing) { console.log(`  skip  movie      ${m.slug}`); continue; }

    const seq = await prisma.contentSequence.upsert({
      where: { type: "MOVIE" },
      create: { type: "MOVIE", lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    const code = `MOV-${String(seq.lastValue).padStart(6, "0")}`;
    const dbStatus = mapStatus(m.status);
    const releaseDate = new Date(`${m.year}-06-15`);

    await prisma.$transaction(async (tx) => {
      const content = await tx.content.create({
        data: {
          contentCode: code,
          type: "MOVIE",
          title: m.title,
          slug: m.slug,
          description: m.description,
          status: dbStatus,
          visibility: "PUBLIC",
          ageRating: m.rating,
          releaseDate,
          publishedAt: dbStatus === "PUBLISHED" ? releaseDate : null,
          featured: m.featured ?? false,
          trending: m.trending ?? false,
          popular: m.popular ?? false,
          newRelease: m.newRelease ?? false,
        },
      });
      await tx.movie.create({ data: { contentId: content.id, runtimeMinutes: runtimeToMinutes(m.runtime) } });
      for (const genreName of m.genres) {
        const g = findGenre(genreName);
        if (g) await tx.contentGenre.create({ data: { contentId: content.id, genreId: g.id } }).catch(() => {});
      }
    });

    console.log(`  +     movie      ${code}  ${m.title}`);
    movieSeeded++;
  }

  /* ── ebooks ── */
  let ebookSeeded = 0;
  for (const e of EBOOKS) {
    const existing = await prisma.content.findUnique({ where: { slug: e.slug } });
    if (existing) { console.log(`  skip  ebook      ${e.slug}`); continue; }

    const seq = await prisma.contentSequence.upsert({
      where: { type: "EBOOK" },
      create: { type: "EBOOK", lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    const code = `EBK-${String(seq.lastValue).padStart(6, "0")}`;
    const dbStatus = mapStatus(e.status);
    const releaseDate = new Date("2024-03-01");

    await prisma.$transaction(async (tx) => {
      const content = await tx.content.create({
        data: {
          contentCode: code,
          type: "EBOOK",
          title: e.title,
          slug: e.slug,
          description: e.description,
          status: dbStatus,
          visibility: "PUBLIC",
          releaseDate,
          publishedAt: dbStatus === "PUBLISHED" ? releaseDate : null,
        },
      });
      await tx.ebook.create({
        data: {
          contentId: content.id,
          author: e.author,
          pageCount: e.pages,
          isbn: e.isbn,
          series: e.series ?? null,
          publisher: "StreamVerse Press",
        },
      });
      const g = findGenre(e.genre);
      if (g) await tx.contentGenre.create({ data: { contentId: content.id, genreId: g.id } }).catch(() => {});
    });

    console.log(`  +     ebook      ${code}  ${e.title}`);
    ebookSeeded++;
  }

  /* ── audiobooks ── */
  let audiobookSeeded = 0;
  for (const a of AUDIOBOOKS) {
    const existing = await prisma.content.findUnique({ where: { slug: a.slug } });
    if (existing) { console.log(`  skip  audiobook  ${a.slug}`); continue; }

    const seq = await prisma.contentSequence.upsert({
      where: { type: "AUDIOBOOK" },
      create: { type: "AUDIOBOOK", lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    const code = `AUD-${String(seq.lastValue).padStart(6, "0")}`;
    const dbStatus = mapStatus(a.status);
    const releaseDate = new Date("2024-01-01");

    await prisma.$transaction(async (tx) => {
      const content = await tx.content.create({
        data: {
          contentCode: code,
          type: "AUDIOBOOK",
          title: a.title,
          slug: a.slug,
          description: a.description,
          status: dbStatus,
          visibility: "PUBLIC",
          releaseDate,
          publishedAt: dbStatus === "PUBLISHED" ? releaseDate : null,
        },
      });
      await tx.audiobook.create({
        data: {
          contentId: content.id,
          author: a.author,
          narrator: a.narrator,
          isbn: a.isbn,
          durationSeconds: a.durationSeconds,
          publisher: "StreamVerse Audio",
          deliveryMode: "SINGLE_FILE",
        },
      });
      const g = findGenre(a.genre);
      if (g) await tx.contentGenre.create({ data: { contentId: content.id, genreId: g.id } }).catch(() => {});
    });

    console.log(`  +     audiobook  ${code}  ${a.title}`);
    audiobookSeeded++;
  }

  console.log(`\nDone. Seeded: ${movieSeeded} movies, ${ebookSeeded} ebooks, ${audiobookSeeded} audiobooks.`);
  console.log("To remove demo data run: npm run seed:demo:delete");
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
