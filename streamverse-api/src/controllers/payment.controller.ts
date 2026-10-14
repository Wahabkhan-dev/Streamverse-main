import type { Request, Response } from "express";
import * as paymentService from "../services/billing/payment.service";
import { sendPaginated } from "../utils/apiResponse";

export async function listMyPayments(req: Request, res: Response) {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const { rows, pagination } = await paymentService.listMyPayments(req.auth!.userId, page, limit);
  sendPaginated(res, rows, pagination, "Billing history");
}
