import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const create = (data: Prisma.AuditLogUncheckedCreateInput, client: Prisma.TransactionClient | typeof prisma = prisma) => client.auditLog.create({ data });

export const list = (where: Prisma.AuditLogWhereInput, take = 50) => prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take });
