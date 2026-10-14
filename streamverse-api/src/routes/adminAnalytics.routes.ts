import { Router } from "express";
import * as analyticsController from "../controllers/adminAnalytics.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const adminAnalyticsRouter = Router();

adminAnalyticsRouter.get("/users", asyncHandler(analyticsController.usersAnalytics));
adminAnalyticsRouter.get("/subscriptions", asyncHandler(analyticsController.subscriptionsAnalytics));
adminAnalyticsRouter.get("/revenue", asyncHandler(analyticsController.revenueAnalytics));
adminAnalyticsRouter.get("/movies", asyncHandler(analyticsController.moviesAnalytics));
adminAnalyticsRouter.get("/ebooks", asyncHandler(analyticsController.ebooksAnalytics));
adminAnalyticsRouter.get("/audiobooks", asyncHandler(analyticsController.audiobooksAnalytics));
adminAnalyticsRouter.get("/top-content", asyncHandler(analyticsController.topContent));
adminAnalyticsRouter.get("/top-genres", asyncHandler(analyticsController.topGenres));
