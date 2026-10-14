import { Router } from "express";
import { z } from "zod";
import * as deviceController from "../controllers/device.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

export const deviceRouter = Router();
deviceRouter.use(requireAuth);

deviceRouter.post(
  "/register",
  validate({
    body: z.object({
      deviceIdentifier: z.string().min(1).max(128),
      deviceName: z.string().max(100).optional(),
      deviceType: z.string().max(50).optional(),
      platform: z.string().max(50).optional(),
    }),
  }),
  asyncHandler(deviceController.register),
);
deviceRouter.get("/", asyncHandler(deviceController.list));
deviceRouter.delete("/:id", validate({ params: z.object({ id: z.string().min(1) }) }), asyncHandler(deviceController.remove));
