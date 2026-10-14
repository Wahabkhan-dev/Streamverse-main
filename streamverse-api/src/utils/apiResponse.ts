import type { Response } from "express";
import type { FieldError } from "./errors";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** { success: true, message, data } */
export function sendSuccess<T>(res: Response, data: T, message = "OK", status = 200) {
  return res.status(status).json({ success: true, message, data });
}

/** { success: true, data: [], pagination } */
export function sendPaginated<T>(res: Response, data: T[], pagination: Pagination, message = "OK") {
  return res.status(200).json({ success: true, message, data, pagination });
}

/** { success: false, message, errors } (requestId lets support find the log line) */
export function sendError(res: Response, status: number, message: string, errors: FieldError[] = [], extra: { code?: string; requestId?: string } = {}) {
  return res.status(status).json({ success: false, message, errors, ...extra });
}
