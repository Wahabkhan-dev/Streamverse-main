import "express";
import type { AuthContext } from "../middleware/auth.middleware";
import type { AccessContext } from "../services/entitlement/entitlement.service";

declare module "express-serve-static-core" {
  interface Request {
    /** set by requestId middleware */
    id: string;
    /** alias for id — set by requestId middleware; used by Sentry and observability integrations */
    requestId: string;
    /** set by requireAuth; absent on an unauthenticated request */
    auth?: AuthContext;
    /**
     * Phase 8: built by `buildAccessContext` middleware.
     * Present on any route that runs that middleware (currently: media access routes).
     * On unauthenticated routes, userId/role/accountStatus/country are all undefined.
     */
    accessContext?: AccessContext;
  }
}
