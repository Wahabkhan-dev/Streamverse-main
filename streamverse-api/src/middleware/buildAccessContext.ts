/**
 * Phase 8: AccessContext builder middleware.
 *
 * Reads `req.auth` (populated by `requireAuth` or `optionalAuth`) and attaches `req.accessContext` so
 * controllers can pass it to the entitlement service without re-fetching the user themselves.
 *
 * Must be placed AFTER an auth middleware (requireAuth / optionalAuth) in the router chain.
 * Safe on unauthenticated routes — produces an empty context when no auth token is present.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import * as userRepository from "../repositories/user.repository";
import type { AccessContext } from "../services/entitlement/entitlement.service";

export const buildAccessContext: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  void (async () => {
    if (!req.auth?.userId) {
      req.accessContext = {};
      return;
    }

    const user = await userRepository.findById(req.auth.userId);
    if (!user) {
      // Shouldn't happen (requireAuth already checks this), but be defensive
      req.accessContext = {};
      return;
    }

    req.accessContext = {
      userId: user.id,
      role: user.role as "USER" | "ADMIN",
      accountStatus: user.status,
      country: user.country ?? undefined,
      requestId: req.id,
      ip: (req.ip ?? undefined),
    } satisfies AccessContext;
  })().then(() => next(), next);
};
