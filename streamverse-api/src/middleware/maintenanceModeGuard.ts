import type { NextFunction, Request, RequestHandler, Response } from "express";
import { isMaintenanceMode } from "../services/settings/appSettings.service";
import { readMaintenanceCache, writeMaintenanceCache } from "../utils/maintenanceModeCache";
import { sendError } from "../utils/apiResponse";

/**
 * Always reachable during maintenance: health checks and webhooks, and the sign-in / session endpoints. Signing in must work
 * so an administrator can always get back in to turn maintenance off (the guard still blocks everything else for customers),
 * and the public settings are how the site learns it should show its maintenance screen.
 */
const EXEMPT_PATHS = ["/health", "/api/v1/health", "/api/v1/webhooks", "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/auth/me", "/api/v1/settings/public"];
const MAINTENANCE_CODE = "MAINTENANCE_MODE";

// Maximum time (ms) we'll wait for the DB before failing-open.
// Keeps the guard from stalling the request if the database is unreachable.
const GUARD_TIMEOUT_MS = 200;

async function getMaintenanceMode(): Promise<boolean> {
  const { value, valid } = readMaintenanceCache();
  if (valid) return value;

  // Race: real DB read vs. a short timeout that fails-open.
  // Either way we cache the result so subsequent requests in the same process are instant.
  const fallback = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), GUARD_TIMEOUT_MS));
  try {
    const result = await Promise.race([isMaintenanceMode(), fallback]);
    writeMaintenanceCache(result);
    return result;
  } catch {
    // DB threw before the timeout (e.g. ECONNREFUSED) — fail-open and cache briefly.
    writeMaintenanceCache(false);
    return false;
  }
}

/**
 * Returns 503 when maintenanceMode=true, unless:
 * - The request path starts with an exempt prefix (health, webhooks, sign-in and session endpoints, public settings)
 * - The authenticated user has ADMIN role
 */
export const maintenanceModeGuard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    for (const exempt of EXEMPT_PATHS) {
      if (req.path.startsWith(exempt)) return next();
    }

    // ADMIN role bypasses maintenance
    if (req.auth?.role === "ADMIN") return next();

    const maintenanceActive = await getMaintenanceMode();
    if (maintenanceActive) {
      sendError(res, 503, "Service temporarily unavailable", [], { code: MAINTENANCE_CODE });
      return;
    }

    next();
  })().catch(next);
};
