/**
 * Admin bootstrap script — run once, explicitly, never on API startup.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... ADMIN_NAME="Your Name" npx tsx scripts/createAdmin.ts
 *
 * Or with .env loaded:
 *   npx tsx scripts/createAdmin.ts
 *
 * Reads ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME from the environment.
 * Creates an ADMIN user if the email does not exist yet; exits non-zero on any error.
 * Refuses to run if ADMIN_PASSWORD is weak (< 16 characters).
 */
import "dotenv/config";
import { prisma } from "../src/config/database";
import { hashPassword } from "../src/services/password.service";
import { normalizeEmail } from "../src/utils/email";

const MIN_PASSWORD_LENGTH = 16;

async function main() {
  const email = process.env["ADMIN_EMAIL"];
  const password = process.env["ADMIN_PASSWORD"];
  const name = process.env["ADMIN_NAME"];

  if (!email || !password || !name) {
    console.error("ERROR: ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME must all be set.");
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`ERROR: ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters for production bootstrap.`);
    process.exit(1);
  }

  // Refuse default placeholder passwords
  const WEAK = /change-?me|example|placeholder|^password$/i;
  if (WEAK.test(password)) {
    console.error("ERROR: ADMIN_PASSWORD looks like a placeholder. Set a real, unique password.");
    process.exit(1);
  }

  const normalizedEmail = normalizeEmail(email);
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (existing) {
    if (existing.role === "ADMIN") {
      console.log(`INFO: ${normalizedEmail} already exists as ADMIN (id: ${existing.id}). No changes made.`);
    } else {
      console.log(`INFO: ${normalizedEmail} already exists as ${existing.role}. No changes made. Promote manually if needed.`);
    }
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash, fullName: name, role: "ADMIN", status: "ACTIVE", emailVerified: true },
  });

  console.log(`SUCCESS: Created ADMIN account ${admin.email} (id: ${admin.id}).`);
}

main()
  .catch((err: unknown) => {
    console.error("ERROR:", err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
