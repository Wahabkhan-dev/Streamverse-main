/**
 * Development seed. Idempotent end to end — safe to run on every deploy/startup.
 *
 *  1. The first ADMIN account, from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME (skipped if unset, or if
 *     that email already has an account). The only way an ADMIN is ever created — never through
 *     POST /auth/register.
 *  2. Phase 3 reference data: common languages, starter genres, the fixed content warning vocabulary,
 *     legal document shells (DRAFT, clearly-marked placeholder text — not reviewed, not published), and
 *     safe app setting defaults.
 *
 * Does NOT seed: fake payments, subscriptions, or realistic production-scale catalog content.
 */
import "dotenv/config";
import { hashPassword } from "../src/services/password.service";
import { normalizeEmail } from "../src/utils/email";
import { prisma } from "../src/config/database";
import { createSlugFromTitle } from "../src/services/slug.service";

async function seedAdmin() {
  const email = process.env["ADMIN_EMAIL"];
  const password = process.env["ADMIN_PASSWORD"];
  const name = process.env["ADMIN_NAME"];

  if (!email || !password || !name) {
    console.log("ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME are not all set — skipping admin bootstrap.");
    return;
  }
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters.");

  const normalizedEmail = normalizeEmail(email);
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    console.log(`An account already exists for ${normalizedEmail} (role: ${existing.role}) — no changes made.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.user.create({ data: { email: normalizedEmail, passwordHash, fullName: name, role: "ADMIN", status: "ACTIVE", emailVerified: true } });
  console.log(`Created ADMIN account ${admin.email} (id: ${admin.id}).`);
}

const LANGUAGES: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "hi", name: "Hindi" },
  { code: "ur", name: "Urdu" },
  { code: "ar", name: "Arabic" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
];

async function seedLanguages() {
  for (const l of LANGUAGES) await prisma.language.upsert({ where: { code: l.code }, create: l, update: { name: l.name } });
  console.log(`Languages: ${LANGUAGES.length} ensured.`);
}

const GENRES: { name: string; contentType?: "MOVIE" | "EBOOK" | "AUDIOBOOK" }[] = [
  { name: "Action" }, { name: "Adventure" }, { name: "Animation" }, { name: "Comedy" }, { name: "Crime" },
  { name: "Documentary" }, { name: "Drama" }, { name: "Fantasy" }, { name: "Horror" }, { name: "Mystery" },
  { name: "Romance" }, { name: "Sci-Fi" }, { name: "Thriller" }, { name: "Biography" }, { name: "History" },
  { name: "Self-Help", contentType: "EBOOK" }, { name: "Poetry", contentType: "EBOOK" },
];

async function seedGenres() {
  for (const g of GENRES) {
    const slug = createSlugFromTitle(g.name);
    await prisma.genre.upsert({ where: { slug }, create: { name: g.name, slug, contentType: g.contentType }, update: {} });
  }
  console.log(`Genres: ${GENRES.length} ensured.`);
}

const WARNING_TYPES: { key: string; label: string }[] = [
  { key: "VIOLENCE", label: "Violence" },
  { key: "STRONG_VIOLENCE", label: "Strong Violence" },
  { key: "STRONG_LANGUAGE", label: "Strong Language" },
  { key: "SEXUAL_CONTENT", label: "Sexual Content" },
  { key: "NUDITY", label: "Nudity" },
  { key: "DRUGS", label: "Drug Use" },
  { key: "ALCOHOL", label: "Alcohol Use" },
  { key: "SMOKING", label: "Smoking" },
  { key: "FRIGHTENING_SCENES", label: "Frightening Scenes" },
  { key: "SELF_HARM_THEMES", label: "Self-Harm Themes" },
  { key: "FLASHING_LIGHTS", label: "Flashing Lights" },
  { key: "MATURE_THEMES", label: "Mature Themes" },
  { key: "OTHER", label: "Other" },
];

async function seedWarningTypes() {
  for (const w of WARNING_TYPES) await prisma.contentWarningType.upsert({ where: { key: w.key }, create: w, update: { label: w.label } });
  console.log(`Content warning types: ${WARNING_TYPES.length} ensured.`);
}

/**
 * Section 56: these are clearly-marked development placeholders, not approved legal text. Seeded as
 * DRAFT only — nothing is published here, so a customer-facing "no document" state is correct until an
 * admin reviews and publishes real text later.
 */
const LEGAL_DOCS: { type: "PRIVACY_POLICY" | "TERMS_AND_CONDITIONS" | "REFUND_POLICY"; title: string; slug: string; placeholder: string }[] = [
  { type: "PRIVACY_POLICY", title: "Privacy Policy", slug: "privacy-policy", placeholder: "DEVELOPMENT PLACEHOLDER — not reviewed, not legally approved. Replace before launch." },
  { type: "TERMS_AND_CONDITIONS", title: "Terms & Conditions", slug: "terms-and-conditions", placeholder: "DEVELOPMENT PLACEHOLDER — not reviewed, not legally approved. Replace before launch." },
  { type: "REFUND_POLICY", title: "Refund Policy", slug: "refund-policy", placeholder: "DEVELOPMENT PLACEHOLDER — not reviewed, not legally approved. Replace before launch." },
];

async function seedLegalDocuments() {
  for (const doc of LEGAL_DOCS) {
    const existing = await prisma.legalDocument.findUnique({ where: { type: doc.type } });
    if (existing) continue;
    await prisma.$transaction(async (tx) => {
      const created = await tx.legalDocument.create({ data: { type: doc.type, title: doc.title, slug: doc.slug } });
      const version = await tx.legalDocumentVersion.create({ data: { legalDocumentId: created.id, version: "0.1", title: doc.title, content: doc.placeholder, status: "DRAFT" } });
      await tx.legalDocument.update({ where: { id: created.id }, data: { currentDraftVersionId: version.id } });
    });
  }
  console.log(`Legal documents: ${LEGAL_DOCS.length} ensured (DRAFT placeholders, nothing published).`);
}

const SETTINGS_DEFAULTS: { key: string; value: string; type: "BOOLEAN" | "STRING" }[] = [
  { key: "maintenanceMode", value: "false", type: "BOOLEAN" },
  { key: "registrationEnabled", value: "true", type: "BOOLEAN" },
  { key: "ageGateEnabled", value: "true", type: "BOOLEAN" },
  { key: "defaultLanguage", value: "en", type: "STRING" },
  { key: "billingNotifications", value: "true", type: "BOOLEAN" },
  { key: "newContentAlerts", value: "true", type: "BOOLEAN" },
  { key: "autoplayDefaults", value: "true", type: "BOOLEAN" },
];

async function seedSettings() {
  for (const s of SETTINGS_DEFAULTS) await prisma.appSetting.upsert({ where: { key: s.key }, create: s, update: {} });
  console.log(`App settings: ${SETTINGS_DEFAULTS.length} defaults ensured.`);
}

async function main() {
  await seedAdmin();
  await seedLanguages();
  await seedGenres();
  await seedWarningTypes();
  await seedLegalDocuments();
  await seedSettings();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
