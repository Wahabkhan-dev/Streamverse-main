import type { Request, Response } from "express";
import * as paymentService from "../services/billing/payment.service";
import * as refundService from "../services/billing/refund.service";
import { auditContext } from "../services/auditLog.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as Parameters<typeof paymentService.adminListPayments>[0];
  const { rows, pagination } = await paymentService.adminListPayments(query);
  sendPaginated(res, rows, pagination, "Payments");
}
export async function getOne(req: Request, res: Response) {
  sendSuccess(res, await paymentService.adminGetPayment(req.params["id"]!), "Payment");
}
export async function summary(req: Request, res: Response) {
  const query = req.query as unknown as Parameters<typeof paymentService.adminPaymentSummary>[0];
  sendSuccess(res, await paymentService.adminPaymentSummary(query), "Payment summary");
}
export async function refund(req: Request, res: Response) {
  sendSuccess(res, await refundService.refundPayment(req.params["id"]!, req.body, req.auth!.userId, auditContext(req)), "Refund initiated", 201);
}
