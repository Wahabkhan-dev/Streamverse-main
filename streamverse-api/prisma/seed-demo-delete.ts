/**
 * Removes the demo catalog content seeded by seed-demo.ts.
 * Deletes only the known slugs; leaves all other data (users, settings, genres) intact.
 *
 * Run:  npm run seed:demo:delete
 */
import "dotenv/config";
import { prisma } from "../src/config/database";

const DEMO_SLUGS = [
  // movies
  "crimson-horizon", "neon-requiem", "the-last-crown", "velocity-zero", "glass-quiet",
  "abyssal", "roman-summer", "white-silence", "ember-protocol", "midnight-ledger",
  // ebooks
  "the-quiet-tide", "atomic-mornings", "ash-and-iron", "the-founders-map", "a-life-in-ink",
  "the-glass-orchard", "letters-to-june", "little-lantern", "northern-lights", "deep-focus",
  // audiobooks
  "echoes-of-mars", "the-calm-mind", "kingdom-of-salt", "the-long-game", "midnight-in-lisbon",
  "born-to-run-far", "starlight-stories", "a-summer-promise",
];

async function main() {
  console.log("StreamVerse — removing demo catalog data...\n");

  const result = await prisma.content.deleteMany({
    where: { slug: { in: DEMO_SLUGS } },
  });

  console.log(`Deleted ${result.count} content rows (cascade removes Movie/Ebook/Audiobook/ContentGenre rows).`);
  if (result.count < DEMO_SLUGS.length) {
    console.log(`${DEMO_SLUGS.length - result.count} slugs were already absent — nothing to do for those.`);
  }
  console.log("\nDemo data removed. ContentSequence counters are NOT reset (codes are never reused).");
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
