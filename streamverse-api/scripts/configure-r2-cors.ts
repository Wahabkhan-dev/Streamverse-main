/**
 * One-off: set Cloudflare R2 bucket CORS from the project's own S3Client config (no new dependency).
 * Run: npx tsx scripts/configure-r2-cors.ts [--verify-only]
 *
 * STATUS (2026-10-19): the app's AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in .env returned
 * `AccessDenied` on BOTH GetBucketCors and PutBucketCors — this R2 API token is correctly scoped to
 * object-level read/write only (the right posture for an application credential), not bucket
 * administration. CORS is a bucket-admin-level R2 permission, so this script needs a *different*,
 * more-privileged R2 API token (Cloudflare dashboard → R2 → Manage API tokens → "Admin Read & Write",
 * scoped to this bucket) passed via one-off env vars, e.g.:
 *   R2_ADMIN_ACCESS_KEY_ID=... R2_ADMIN_SECRET_ACCESS_KEY=... npx tsx scripts/configure-r2-cors.ts
 * Do NOT widen the app's own token's permissions just to run this — keep the running app on a
 * least-privilege, object-only token. See the audit report for the exact dashboard steps instead.
 */
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { env } from "../src/config/env";

const client = new S3Client({
  region: env.AWS_REGION ?? "auto",
  endpoint: env.AWS_ENDPOINT,
  forcePathStyle: env.AWS_FORCE_PATH_STYLE ?? !!env.AWS_ENDPOINT,
  credentials: {
    accessKeyId: process.env["R2_ADMIN_ACCESS_KEY_ID"] ?? env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env["R2_ADMIN_SECRET_ACCESS_KEY"] ?? env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Local dev origins only, from ALLOWED_ORIGINS (backend CORS) — production domains must be added
// separately once the production frontend domain is finalized; see the audit report for instructions.
const LOCAL_ORIGINS = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const CORS_RULES = [
  {
    AllowedOrigins: LOCAL_ORIGINS,
    AllowedMethods: ["GET", "PUT", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  },
];

async function main() {
  const verifyOnly = process.argv.includes("--verify-only");
  console.log("Bucket:", env.AWS_BUCKET);
  console.log("Endpoint:", env.AWS_ENDPOINT);
  console.log("Origins to allow:", LOCAL_ORIGINS);

  if (!verifyOnly) {
    await client.send(new PutBucketCorsCommand({ Bucket: env.AWS_BUCKET, CORSConfiguration: { CORSRules: CORS_RULES } }));
    console.log("PutBucketCors: OK");
  }

  const current = await client.send(new GetBucketCorsCommand({ Bucket: env.AWS_BUCKET }));
  console.log("Current CORS rules:", JSON.stringify(current.CORSRules, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err.name, err.message);
  process.exit(1);
});
