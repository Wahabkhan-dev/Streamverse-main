import type { CorsOptions } from "cors";
import { ForbiddenError } from "../utils/errors";
import { env } from "./env";

/**
 * Only configured frontend origins may call the API from a browser, with credentials.
 * Never `*`: a wildcard cannot be combined with cookies and would let any site read authenticated data.
 * Requests with no Origin header (curl, server-to-server, Stripe webhooks) are not browser CORS requests.
 */
export function buildCorsOptions(allowedOrigins: readonly string[] = env.allowedOrigins): CorsOptions {
  return {
    origin(origin, callback) {
      // Allow requests with no origin (server-to-server, health checks, Stripe webhooks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // a 403 (and a debug-level log), not a 500: a page on another site calling the API is not a server failure
      callback(new ForbiddenError("This origin is not allowed to call the StreamVerse API"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
    maxAge: 600,
  };
}
