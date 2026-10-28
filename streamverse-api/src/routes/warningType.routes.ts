import { Router } from "express";
import { prisma } from "../config/database";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";

/** Mounted at /api/v1/admin/warning-types - read-only list of the content-warning options the wizards offer. */
export const warningTypeRouter = Router();
warningTypeRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await prisma.contentWarningType.findMany({ orderBy: { label: "asc" }, select: { id: true, key: true, label: true } }), "Warning types");
  }),
);
