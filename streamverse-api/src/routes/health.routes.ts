import { Router } from "express";
import { health, ready } from "../controllers/health.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const healthRouter = Router();
healthRouter.get("/health", health);
healthRouter.get("/ready", asyncHandler(ready));
