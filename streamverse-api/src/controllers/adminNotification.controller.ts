import type { Request, Response } from "express";
import { auditContext, recordAudit } from "../services/auditLog.service";
import { broadcastAnnouncement } from "../services/notification.service";
import { sendSuccess } from "../utils/apiResponse";

/** Sends an announcement to every active customer's notification bell. */
export async function announce(req: Request, res: Response) {
  const { kind, title, message } = req.body as { kind: "NEW_RELEASE" | "SUBSCRIPTION" | "RECOMMENDATION" | "ACCOUNT"; title: string; message?: string };
  const sent = await broadcastAnnouncement(kind, title, message ?? "");
  await recordAudit(auditContext(req), { action: "notification.announced", entityType: "NOTIFICATION", entityId: kind, metadata: { title, sent } });
  sendSuccess(res, { sent }, `Sent to ${sent} customer${sent === 1 ? "" : "s"}`, 201);
}
