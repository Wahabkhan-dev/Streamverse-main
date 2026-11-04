import type { Request, Response } from "express";
import { estimatePlanChange, getAccountCredit } from "../services/billing/planChange.service";
import * as subscriptionService from "../services/billing/subscription.service";
import { auditContext } from "../services/auditLog.service";
import { sendSuccess } from "../utils/apiResponse";

export async function getMySubscription(req: Request, res: Response) {
  sendSuccess(res, await subscriptionService.getMySubscription(req.auth!.userId), "Subscription status");
}
export async function checkout(req: Request, res: Response) {
  sendSuccess(res, await subscriptionService.createCheckoutSession(req.auth!.userId, req.body.planId, auditContext(req), req.body.popup === true), "Checkout session created", 201);
}
export async function paymentIntent(req: Request, res: Response) {
  sendSuccess(res, await subscriptionService.createPaymentIntentForPlan(req.auth!.userId, req.body.planId, auditContext(req)), "Payment ready", 201);
}
export async function sync(req: Request, res: Response) {
  sendSuccess(res, await subscriptionService.syncMySubscription(req.auth!.userId), "Subscription status");
}
export async function cancel(req: Request, res: Response) {
  sendSuccess(res, await subscriptionService.cancelSubscription(req.auth!.userId, auditContext(req)), "Cancellation scheduled");
}
export async function resume(req: Request, res: Response) {
  sendSuccess(res, await subscriptionService.resumeSubscription(req.auth!.userId, auditContext(req)), "Subscription resumed");
}
export async function previewPlanChange(req: Request, res: Response) {
  sendSuccess(res, await estimatePlanChange(req.auth!.userId, String(req.query["planId"])), "Plan change preview");
}

export async function accountCredit(req: Request, res: Response) {
  sendSuccess(res, await getAccountCredit(req.auth!.userId), "Account credit");
}

export async function changePlan(req: Request, res: Response) {
  sendSuccess(res, await subscriptionService.changePlan(req.auth!.userId, req.body.planId, auditContext(req)), "Plan changed");
}
export async function billingPortal(req: Request, res: Response) {
  sendSuccess(res, await subscriptionService.createBillingPortalSession(req.auth!.userId, auditContext(req)), "Billing portal session created");
}
