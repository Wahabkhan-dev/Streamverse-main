import { Router } from "express";
import * as auditLogController from "../controllers/adminAuditLog.controller";
import { asyncHandler } from "../utils/asyncHandler";

/** No PUT/DELETE on audit logs — immutable. */
export const adminAuditLogRouter = Router();

adminAuditLogRouter.get("/", asyncHandler(auditLogController.list));
adminAuditLogRouter.get("/:id", asyncHandler(auditLogController.getOne));
