/**
 * Seed baseline homepage sections from the frontend HOME_DEFAULTS.
 * Idempotent: uses upsert on the unique `key` field — safe to rerun.
 * Does NOT delete admin-created sections.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASELINE_SECTIONS: {
  key: string;
  displayTitle: string;
  type: "MANUAL" | "TRENDING" | "POPULAR" | "NEW_RELEASE" | "FEATURED" | "LATEST";
  contentType: "MOVIE" | "EBOOK" | "AUDIOBOOK" | null;
  itemLimit: number;
  displayOrder: number;
  enabled: boolean;
}[] = [
  { key: "hero",                displayTitle: "Hero Banner",           type: "MANUAL",      contentType: null,       itemLimit: 4,  displayOrder: 0, enabled: true  },
  { key: "continue",            displayTitle: "Continue Watching",     type: "MANUAL",      contentType: null,       itemLimit: 12, displayOrder: 1, enabled: true  },
  { key: "trending_movies",     displayTitle: "Trending Movies",       type: "TRENDING",    contentType: "MOVIE",     itemLimit: 12, displayOrder: 2, enabled: true  },
  { key: "popular_movies",      displayTitle: "Popular Movies",        type: "POPULAR",     contentType: "MOVIE",     itemLimit: 12, displayOrder: 3, enabled: true  },
  { key: "latest_movies",       displayTitle: "Latest Movies",         type: "LATEST",      contentType: "MOVIE",     itemLimit: 12, displayOrder: 4, enabled: true  },
  { key: "featured_ebooks",     displayTitle: "Featured eBooks",       type: "FEATURED",    contentType: "EBOOK",     itemLimit: 12, displayOrder: 5, enabled: true  },
  { key: "new_ebooks",          displayTitle: "New eBooks",            type: "NEW_RELEASE", contentType: "EBOOK",     itemLimit: 12, displayOrder: 6, enabled: true  },
  { key: "featured_audiobooks", displayTitle: "Featured Audiobooks",   type: "FEATURED",    contentType: "AUDIOBOOK", itemLimit: 12, displayOrder: 7, enabled: true  },
  { key: "new_audiobooks",      displayTitle: "New Audiobooks",        type: "NEW_RELEASE", contentType: "AUDIOBOOK", itemLimit: 12, displayOrder: 8, enabled: true  },
  { key: "collections",         displayTitle: "Curated Collections",   type: "MANUAL",      contentType: null,       itemLimit: 12, displayOrder: 9, enabled: true  },
];

async function main() {
  console.log("Seeding baseline homepage sections…");

  for (const section of BASELINE_SECTIONS) {
    await prisma.homepageSection.upsert({
      where: { key: section.key },
      update: {}, // never overwrite admin edits
      create: section,
    });
    console.log(`  ✓ ${section.key} (${section.displayTitle})`);
  }

  const total = await prisma.homepageSection.count();
  console.log(`\nDone. ${BASELINE_SECTIONS.length} sections upserted, ${total} total in DB.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
