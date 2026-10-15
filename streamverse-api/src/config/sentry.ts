import * as Sentry from "@sentry/node";
import { env } from "./env";

// Sensitive field patterns — never sent to Sentry
const REDACTED = "[Redacted]";
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordconfirm",
  "newpassword",
  "oldpassword",
  "authorization",
  "cookie",
  "set-cookie",
  "refreshtoken",
  "accesstoken",
  "resettoken",
  "clientsecret",
  "apikey",
  "stripe_secret",
  "database_url",
  "redis_url",
  "x-stripe-signature",
]);

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set — error tracking disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env["SENTRY_ENVIRONMENT"] ?? env.NODE_ENV,
    release: process.env["SENTRY_RELEASE"] ?? process.env["GIT_COMMIT"] ?? "unknown",
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
    profileSessionSampleRate: env.NODE_ENV === "production" ? 0.05 : 0.0,
    beforeSend(event) {
      // Scrub request headers
      if (event.request?.headers) {
        event.request.headers = scrubObject(
          event.request.headers as Record<string, unknown>,
        ) as typeof event.request.headers;
      }
      // Scrub request body
      if (event.request?.data && typeof event.request.data === "object") {
        event.request.data = scrubObject(event.request.data as Record<string, unknown>);
      }
      return event;
    },
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
  });
}

export { Sentry };
