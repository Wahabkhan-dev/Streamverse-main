import type { RequestHandler } from "express";
import type { Role } from "../constants/roles";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";

/**
 * Must run after requireAuth. 401 if nothing authenticated the request at all; 403 if it did, but the
 * role isn't one of `roles` — these are deliberately different statuses, not interchangeable.
 */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(new UnauthorizedError("Authentication required"));
    if (!roles.includes(req.auth.role)) return next(new ForbiddenError("You do not have permission to perform this action"));
    next();
  };
