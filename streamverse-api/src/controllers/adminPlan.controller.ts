import type { Request, Response } from "express";
import * as planService from "../services/billing/plan.service";
import { auditContext } from "../services/auditLog.service";
import { sendSuccess } from "../utils/apiResponse";

export async function list(_req: Request, res: Response) {
  sendSuccess(res, await planService.listAdminPlans(), "Plans");
}
export async function getOne(req: Request, res: Response) {
  sendSuccess(res, await planService.getPlan(req.params["id"]!), "Plan");
}
export async function create(req: Request, res: Response) {
  sendSuccess(res, await planService.createPlan(req.body, auditContext(req)), "Plan created", 201);
}
export async function update(req: Request, res: Response) {
  sendSuccess(res, await planService.updatePlan(req.params["id"]!, req.body, auditContext(req)), "Plan updated");
}
