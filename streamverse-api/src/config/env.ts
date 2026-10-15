import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());
const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const PLACEHOLDER = /change-?me|example|placeholder|^secret$|dev-?secret/i;

export function parseOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional()),
    API_DOCS_ENABLED: z.preprocess(emptyToUndefined, bool.optional()),

    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine((v) => /^mysql:\/\//.test(v), "DATABASE_URL must be a mysql:// URL"),

    FRONTEND_URL: z.url("FRONTEND_URL must be a full URL, e.g. http://localhost:5173"),
    ALLOWED_ORIGINS: z.string().default(""),

    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(30),
    AUTH_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),

    // Admin bootstrap (prisma/seed.ts only; the running API never reads these to create an admin).
    ADMIN_EMAIL: optional(z.email()),
    ADMIN_PASSWORD: optional(z.string().min(8)),
    ADMIN_NAME: optional(z.string().min(1)),

    // Phase 7: Stripe billing. Required — validated at startup (Section 3/115), never read ad hoc.
    STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),
    STRIPE_SUCCESS_URL: z.url("STRIPE_SUCCESS_URL must be a full URL"),
    STRIPE_CANCEL_URL: z.url("STRIPE_CANCEL_URL must be a full URL"),
    STRIPE_PORTAL_RETURN_URL: optional(z.url()),

    // Phase 6: object storage. One S3-compatible provider (AWS S3, Cloudflare R2, Backblaze B2,
    // DigitalOcean Spaces all speak the same API) behind `StorageProvider` — see storage.provider.ts.
    STORAGE_PROVIDER: z.enum(["s3", "r2", "b2", "spaces", "local"]).default("local"),
    AWS_ACCESS_KEY_ID: optional(z.string().min(1)),
    AWS_SECRET_ACCESS_KEY: optional(z.string().min(1)),
    AWS_REGION: optional(z.string().min(1)),
    AWS_BUCKET: optional(z.string().min(1)),
    AWS_ENDPOINT: optional(z.url()),
    AWS_FORCE_PATH_STYLE: optional(bool),
    /** Dev-only local-filesystem storage adapter (Section 84/85) — never used in production. */
    LOCAL_STORAGE_DIR: z.string().default("./.data/media"),
    /** Public CDN/base URL for assets served publicly (Section 52) — optional; falls back to a signed URL. */
    MEDIA_BASE_URL: optional(z.url()),
    UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(24 * 60 * 60).default(900),
    DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(60 * 60).default(600),
    MEDIA_CLEANUP_GRACE_SECONDS: z.coerce.number().int().min(60).default(24 * 60 * 60),

    // Phase 6: background jobs. "inline" runs a job's handler in-process immediately (an explicit,
    // documented dev/test fallback — Section 60), "bullmq" uses Redis via REDIS_URL for real queuing.
    QUEUE_DRIVER: z.enum(["inline", "bullmq"]).default("inline"),
    REDIS_URL: optional(z.string().regex(/^rediss?:\/\//, "REDIS_URL must start with redis:// or rediss://")),

    /** Section 22: override if ffmpeg/ffprobe aren't on PATH. */
    FFMPEG_PATH: optional(z.string().min(1)),
    FFPROBE_PATH: optional(z.string().min(1)),

    // Phase 8: content access / entitlement.
    /** Days PAST_DUE before access is cut off. 0 = deny immediately on PAST_DUE (safe default). */
    SUBSCRIPTION_PAST_DUE_GRACE_DAYS: z.coerce.number().int().min(0).default(0),
    /** Seconds an entitlement decision is cached in memory per (user, content, type) triple. 0 = disabled. */
    ENTITLEMENT_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(60),

    // Phase 9: analytics cache TTL.
    /** Seconds expensive analytics queries are cached in memory. 0 = disabled. */
    ANALYTICS_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(30),

    // Email delivery.
    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    EMAIL_FROM: z.string().default("noreply@streamverse.com"),
    RESEND_API_KEY: optional(z.string().min(1)),
    /** Public URL of the frontend app, used for email links (e.g. password reset). */
    APP_PUBLIC_URL: optional(z.url()),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_PROVIDER !== "local") {
      for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_BUCKET"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when STORAGE_PROVIDER is "${env.STORAGE_PROVIDER}"` });
      }
    }
    if (env.QUEUE_DRIVER === "bullmq" && !env.REDIS_URL) {
      ctx.addIssue({ code: "custom", path: ["REDIS_URL"], message: 'REDIS_URL is required when QUEUE_DRIVER is "bullmq"' });
    }
    // Section 115: a live secret key paired with a test-mode webhook secret (or vice versa) is a silent
    // production hazard — Stripe would sign webhooks for a different mode than the one API calls use.
    const stripeKeyIsLive = env.STRIPE_SECRET_KEY.startsWith("sk_live_");
    const stripeKeyIsTest = env.STRIPE_SECRET_KEY.startsWith("sk_test_");
    if (env.NODE_ENV === "production" && stripeKeyIsTest) {
      ctx.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "A sk_test_ key is set in production — use a live key." });
    }
    if (env.NODE_ENV !== "production" && stripeKeyIsLive) {
      ctx.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "A sk_live_ key is set outside production — use a test key." });
    }
    const origins = parseOrigins(env.ALLOWED_ORIGINS);
    for (const o of origins) {
      if (o === "*" || !URL.canParse(o) || new URL(o).origin !== o) {
        ctx.addIssue({ code: "custom", path: ["ALLOWED_ORIGINS"], message: `"${o}" is not a valid origin (use scheme://host[:port], no path, no wildcard)` });
      }
    }
    if (env.NODE_ENV === "production") {
      for (const key of ["JWT_SECRET", "JWT_REFRESH_SECRET"] as const) {
        if (PLACEHOLDER.test(env[key])) ctx.addIssue({ code: "custom", path: [key], message: `${key} still looks like a placeholder; set a long random value` });
      }
      if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) ctx.addIssue({ code: "custom", path: ["JWT_REFRESH_SECRET"], message: "JWT_REFRESH_SECRET must differ from JWT_SECRET" });
      for (const o of [env.FRONTEND_URL, ...origins]) {
        if (!o.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["FRONTEND_URL"], message: `${o} must use https in production` });
      }
    }
  });

/** Validates a set of variables and derives the app's config. Throws one readable error listing every problem. */
export function buildEnv(source: NodeJS.ProcessEnv) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example.`);
  }
  const e = parsed.data;
  return {
    ...e,
    isProduction: e.NODE_ENV === "production",
    isTest: e.NODE_ENV === "test",
    logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === "test" ? "silent" : e.NODE_ENV === "production" ? "info" : "debug"),
    docsEnabled: e.API_DOCS_ENABLED ?? e.NODE_ENV !== "production",
    allowedOrigins: [...new Set([new URL(e.FRONTEND_URL).origin, ...parseOrigins(e.ALLOWED_ORIGINS)])],
  };
}
export type Env = ReturnType<typeof buildEnv>;

/** Read once at startup. A missing or invalid value stops the process before it listens. */
export const env: Env = buildEnv(process.env);

/**
 * Additional production gate: refuses to start if critical vars are absent.
 * Call this at the very top of server.ts before any service is initialized.
 * Note: DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, STRIPE_SECRET_KEY, and
 * STRIPE_WEBHOOK_SECRET are already enforced by the Zod schema above (they
 * will have caused process.exit before this function is reached if missing).
 * This function adds REDIS_URL (not required by Zod when QUEUE_DRIVER=inline)
 * and warning-level checks for recommended vars.
 */
export function validateProductionEnv(): void {
  if (process.env["NODE_ENV"] !== "production") return;

  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "REDIS_URL",
  ] as const;

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[startup] FATAL: missing required production env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  // Warn about recommended but not strictly blocking vars
  const recommended = ["SENTRY_DSN", "EMAIL_PROVIDER", "APP_PUBLIC_URL"];
  const missingRec = recommended.filter((k) => !process.env[k]);
  if (missingRec.length > 0) {
    console.warn(`[startup] WARNING: missing recommended env vars: ${missingRec.join(", ")}`);
  }
}
