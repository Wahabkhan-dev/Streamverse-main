/**
 * Phase 9 audit log service extension.
 * Thin wrapper around the existing src/services/auditLog.service.ts, adding:
 * - logAudit() helper matching the Phase 9 spec signature
 * - AUDIT_ACTIONS constants
 * - Secret redaction utility
 */
import { prisma } from "../../config/database";

// Audit action constants
export const AUDIT_ACTIONS = {
  CONTENT_CREATED: "content.created",
  CONTENT_UPDATED: "content.updated",
  CONTENT_PUBLISHED: "content.published",
  CONTENT_UNPUBLISHED: "content.unpublished",
  CONTENT_ARCHIVED: "content.archived",
  CONTENT_DELETED: "content.deleted",
  USER_SUSPENDED: "user.suspended",
  USER_REACTIVATED: "user.reactivated",
  SETTING_CHANGED: "settings.updated",
  PLAN_CREATED: "plan.created",
  PLAN_UPDATED: "plan.updated",
  REFUND_ISSUED: "refund.issued",
  SUBSCRIPTION_CANCELED_ADMIN: "subscription.canceled_admin",
  SUBSCRIPTION_STARTED: "subscription.started",
  SUBSCRIPTION_CANCELED: "subscription.canceled",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Fields that must never appear in audit metadata (defensive, client-level guard). */
const REDACTED_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "stripeSecretKey",
  "stripeWebhookSecret",
  "cardNumber",
  "cvv",
  "signedUrl",
  "presignedUrl",
  "presignedUrlParams",
  "url",
  "storageKey",
]);

export function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(k)) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactSensitive(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export interface LogAuditInput {
  actorUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Fire-and-forget audit log write. Never throws — audit failures must not break the primary action. */
export async function logAudit(entry: LogAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType ?? "SYSTEM",
        entityId: entry.entityId,
        metadata: entry.metadata ? (redactSensitive(entry.metadata) as object) : undefined,
        ip: entry.ip,
        userAgent: entry.userAgent,
        requestId: entry.requestId,
      },
    });
  } catch {
    // Intentionally silent — audit writes are best-effort
  }
}
