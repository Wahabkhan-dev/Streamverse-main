/**
 * Phase 8: structured access audit log.
 * Writes DENIED decisions (and certain ALLOWED ones) to stdout as newline-delimited JSON.
 * Phase 9 adds a proper database table and richer analytics; this is the lightweight foundation.
 */
import type { AccessDecision } from "./entitlement.service";

export interface AccessAuditEntry {
  userId?: string;
  contentId: string;
  contentType: string;
  decision: AccessDecision;
  requestId?: string;
  ip?: string;
}

/** Whether to log this decision. Log all denials; log allowed decisions that represent a consume grant. */
function shouldLog(entry: AccessAuditEntry): boolean {
  if (!entry.decision.allowed) return true;
  // log successful consume authorizations so there is a playback trail
  if (entry.decision.canConsume) return true;
  return false;
}

export function logAccess(entry: AccessAuditEntry): void {
  if (!shouldLog(entry)) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event: entry.decision.allowed ? "ACCESS_GRANTED" : "ACCESS_DENIED",
    userId: entry.userId ?? null,
    contentId: entry.contentId,
    contentType: entry.contentType,
    reason: entry.decision.reason ?? null,
    requestId: entry.requestId ?? null,
    ip: entry.ip ?? null,
  });
  process.stdout.write(line + "\n");
}
