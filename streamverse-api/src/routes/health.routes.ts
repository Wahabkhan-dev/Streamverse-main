import { Router } from "express";
import { health, ready, metrics } from "../controllers/health.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { asyncHandler } from "../utils/asyncHandler";

export const healthRouter = Router();
healthRouter.get("/health", health);
healthRouter.get("/ready", asyncHandler(ready));
healthRouter.get("/metrics", requireAuth, requireRole("ADMIN"), asyncHandler(metrics));
