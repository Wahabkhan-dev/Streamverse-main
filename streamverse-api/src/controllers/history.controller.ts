import type { Request, Response } from "express";
import * as historyService from "../services/history.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";

export async function list(req: Request, res: Response) {
  const { type, page, limit } = req.query as unknown as { type?: "WATCHED" | "READ" | "LISTENED"; page: number; limit: number };
  const { rows, pagination } = await historyService.listHistory(req.auth!.userId, { activityType: type }, page, limit);
  sendPaginated(res, rows, pagination);
}
export async function remove(req: Request, res: Response) {
  await historyService.removeFromHistory(req.auth!.userId, req.params["contentId"]!);
  sendSuccess(res, null, "Removed from History");
}
