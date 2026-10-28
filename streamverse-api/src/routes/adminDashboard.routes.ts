import { Router } from "express";
import * as dashboardController from "../controllers/adminDashboard.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const adminDashboardRouter = Router();

adminDashboardRouter.get("/", asyncHandler(dashboardController.dashboardOverview));
adminDashboardRouter.get("/summary", asyncHandler(dashboardController.summary));
adminDashboardRouter.get("/recent-content", asyncHandler(dashboardController.recentContent));
adminDashboardRouter.get("/recent-users", asyncHandler(dashboardController.recentUsers));
adminDashboardRouter.get("/platform-status", asyncHandler(dashboardController.platformStatus));
