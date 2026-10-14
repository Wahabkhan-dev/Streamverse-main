import type { Request, Response } from "express";
import * as reconciliationService from "../services/billing/stripeReconciliation.service";
import { sendSuccess } from "../utils/apiResponse";

export async function reconcile(req: Request, res: Response) {
  sendSuccess(res, await reconciliationService.reconcileUser(req.params["userId"]!), "Reconciliation complete");
}
