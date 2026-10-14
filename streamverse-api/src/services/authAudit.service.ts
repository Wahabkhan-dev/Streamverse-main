import type { Request } from "express";
import { logger } from "../config/logger";

export type AuthEvent =
  | "login.success"
  | "login.failure"
  | "register.success"
  | "logout"
  | "logout_all"
  | "token.refresh"
  | "token.reuse_detected"
  | "password.reset_requested"
  | "password.reset_success"
  | "password.change_success"
  | "password.change_failure";

/**
 * Security-relevant auth events, as structured log lines (requestId, userId where known, IP, user agent,
 * event). Never a password, token or hash. This is Phase 2's audit trail; Phase 9's AuditLog table is a
 * separate, broader admin-action log and is not built here.
 */
export function logAuthEvent(event: AuthEvent, req: Request, extra: { userId?: string } = {}) {
  logger.info({ requestId: req.id, event, userId: extra.userId, ip: req.ip, userAgent: req.get("user-agent") }, `auth: ${event}`);
}
