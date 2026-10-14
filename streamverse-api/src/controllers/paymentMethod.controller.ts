import type { Request, Response } from "express";
import * as paymentMethodService from "../services/billing/paymentMethod.service";
import { auditContext } from "../services/auditLog.service";
import { sendSuccess } from "../utils/apiResponse";

export async function setup(req: Request, res: Response) {
  sendSuccess(res, await paymentMethodService.createSetupIntent(req.auth!.userId, auditContext(req)), "Setup intent created", 201);
}
export async function list(req: Request, res: Response) {
  sendSuccess(res, await paymentMethodService.listPaymentMethods(req.auth!.userId), "Payment methods");
}
export async function setDefault(req: Request, res: Response) {
  sendSuccess(res, await paymentMethodService.setDefaultPaymentMethod(req.auth!.userId, req.params["id"]!, auditContext(req)), "Default payment method updated");
}
export async function remove(req: Request, res: Response) {
  sendSuccess(res, await paymentMethodService.removePaymentMethod(req.auth!.userId, req.params["id"]!, auditContext(req)), "Payment method removed");
}
