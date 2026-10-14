import { Router } from "express";
import * as publicSettingsController from "../controllers/publicSettings.controller";
import { asyncHandler } from "../utils/asyncHandler";

/** Public settings — no auth required */
export const publicSettingsRouter = Router();

publicSettingsRouter.get("/public", asyncHandler(publicSettingsController.publicList));
