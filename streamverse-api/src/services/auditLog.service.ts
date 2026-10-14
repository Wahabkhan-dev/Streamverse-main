import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import * as auditLogRepository from "../repositories/auditLog.repository";

export interface AuditContext {
  userId: string | undefined;
  ip: string | undefined;
  userAgent: string | undefined;
  requestId: string | undefined;
}

/** Pulls exactly what an audit row needs out of the request — one place, so it's never assembled ad hoc. */
export const auditContext = (req: Request): AuditContext => ({ userId: req.auth?.userId, ip: req.ip, userAgent: req.get("user-agent"), requestId: req.id });

/**
 * Section 60: one row per admin action that changes something. `metadata` is a small plain object (never
 * a password/token/card field — nothing here ever touches those). Pass `client` (a transaction) when the
 * log should land or fail together with the change it describes.
 */
export async function recordAudit(ctx: AuditContext, entry: { action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown> }, client: Prisma.TransactionClient | typeof prisma = prisma) {
  await auditLogRepository.create({ userId: ctx.userId, ip: ctx.ip, userAgent: ctx.userAgent, requestId: ctx.requestId, action: entry.action, entityType: entry.entityType, entityId: entry.entityId, metadata: entry.metadata as Prisma.InputJsonValue }, client);
}

export const listAuditLog = (where: Prisma.AuditLogWhereInput, take?: number) => auditLogRepository.list(where, take);
