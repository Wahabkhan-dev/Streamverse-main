import type { Request, Response } from "express";
import * as analyticsRepo from "../repositories/analytics.repository";
import { sendSuccess, sendPaginated } from "../utils/apiResponse";
import { NotFoundError } from "../utils/errors";

export async function list(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const page = Math.max(1, Number(q["page"] ?? 1));
  const limit = Math.min(Number(q["limit"] ?? 20), 100);
  const take = isNaN(limit) ? 20 : limit;
  const skip = (isNaN(page) ? 0 : page - 1) * take;

  const filters: analyticsRepo.AuditLogFilters = {
    actor: q["actor"] as string | undefined,
    action: q["action"] as string | undefined,
    entityType: q["entityType"] as string | undefined,
    entityId: q["entityId"] as string | undefined,
    dateFrom: q["dateFrom"] ? new Date(q["dateFrom"] as string) : undefined,
    dateTo: q["dateTo"] ? new Date(q["dateTo"] as string) : undefined,
  };

  const { rows, total } = await analyticsRepo.listAuditLogs(filters, skip, take);
  const totalPages = Math.ceil(total / take);
  sendPaginated(res, rows, { page: isNaN(page) ? 1 : page, limit: take, total, totalPages });
}

export async function getOne(req: Request, res: Response) {
  const { id } = req.params;
  const row = await analyticsRepo.getAuditLogById(id!);
  if (!row) throw new NotFoundError("Audit log entry not found");
  sendSuccess(res, row, "Audit log entry");
}
