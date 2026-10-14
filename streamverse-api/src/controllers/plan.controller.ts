import type { Request, Response } from "express";
import * as planService from "../services/billing/plan.service";
import { sendSuccess } from "../utils/apiResponse";

export async function listCustomerPlans(_req: Request, res: Response) {
  sendSuccess(res, await planService.listCustomerPlans(), "Plans");
}
