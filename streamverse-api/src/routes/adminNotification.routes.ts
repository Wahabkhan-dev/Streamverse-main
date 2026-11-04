import { Router } from "express";
import { z } from "zod";
import * as adminNotificationController from "../controllers/adminNotification.controller";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const announceBody = z.object({
  kind: z.enum(["NEW_RELEASE", "SUBSCRIPTION", "RECOMMENDATION", "ACCOUNT"]),
  title: z.string().trim().min(1, "Add a title for the announcement.").max(120),
  message: z.string().trim().max(500).optional(),
});

/** Mounted at /api/v1/admin/notifications - inherits requireAuth + requireRole("ADMIN"). */
export const adminNotificationRouter = Router();
adminNotificationRouter.post("/announce", validate({ body: announceBody }), asyncHandler(adminNotificationController.announce));
