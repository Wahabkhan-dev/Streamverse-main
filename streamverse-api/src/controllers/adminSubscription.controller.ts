import type { Request, Response } from "express";
import * as subscriptionService from "../services/billing/subscription.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as Parameters<typeof subscriptionService.adminListSubscriptions>[0];
  const { rows, pagination } = await subscriptionService.adminListSubscriptions(query);
  sendPaginated(res, rows, pagination, "Subscriptions");
}
export async function getOne(req: Request, res: Response) {
  sendSuccess(res, await subscriptionService.adminGetSubscription(req.params["id"]!), "Subscription");
}
