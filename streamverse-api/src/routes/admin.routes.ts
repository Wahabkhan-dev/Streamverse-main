import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { validate } from "../middleware/validate.middleware";
import { adminBillingRouter } from "./adminBilling.routes";
import { adminContentMediaRouter, adminMediaRouter } from "./adminMedia.routes";
import { adminLegalRouter } from "./adminLegal.routes";
import { adminPaymentRouter } from "./adminPayment.routes";
import { adminPlanRouter } from "./adminPlan.routes";
import { adminSubscriptionRouter } from "./adminSubscription.routes";
import { audiobookRouter } from "./audiobook.routes";
import { bannerRouter } from "./banner.routes";
import { collectionRouter } from "./collection.routes";
import { draftsRouter } from "./drafts.routes";
import { ebookRouter } from "./ebook.routes";
import { genreRouter } from "./genre.routes";
import { homepageRouter } from "./homepage.routes";
import { languageRouter } from "./language.routes";
import { movieRouter } from "./movie.routes";
import { settingsRouter } from "./settings.routes";
import { tagRouter } from "./tag.routes";
import { warningTypeRouter } from "./warningType.routes";
import { uploadRouter } from "./upload.routes";
// Phase 9
import { adminDashboardRouter } from "./adminDashboard.routes";
import { adminAnalyticsRouter } from "./adminAnalytics.routes";
import { adminAuditLogRouter } from "./adminAuditLog.routes";
import { adminUserRouter } from "./adminUser.routes";
import * as publicSettingsController from "../controllers/publicSettings.controller";
import * as adminAnalyticsController from "../controllers/adminAnalytics.controller";
import * as adminAnnouncementController from "../controllers/adminAnnouncement.controller";
import { createAnnouncementSchema } from "../validators/announcement.validator";
import { asyncHandler } from "../utils/asyncHandler";
import { analyticsCache } from "../utils/analyticsCache";
import { HOMEPAGE_CACHE_PREFIX } from "../services/homepage.service";

/**
 * Every route mounted under /api/v1/admin inherits requireAuth + requireRole("ADMIN") from here —
 * Section 2: no controller repeats this check itself.
 */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("ADMIN"));

// Any successful admin write (content, homepage, banners, collections...) can change what the cached public
// homepage should show, so drop it; the next visitor request rebuilds it.
adminRouter.use((req, res, next) => {
  if (req.method !== "GET") {
    res.on("finish", () => {
      if (res.statusCode < 400) analyticsCache.invalidate(HOMEPAGE_CACHE_PREFIX);
    });
  }
  next();
});

adminRouter.use("/movies", movieRouter);
adminRouter.use("/ebooks", ebookRouter);
adminRouter.use("/audiobooks", audiobookRouter);
adminRouter.use("/drafts", draftsRouter);
adminRouter.use("/genres", genreRouter);
adminRouter.use("/tags", tagRouter);
adminRouter.use("/warning-types", warningTypeRouter);
adminRouter.use("/languages", languageRouter);
adminRouter.use("/collections", collectionRouter);
adminRouter.use("/homepage/sections", homepageRouter);
adminRouter.use("/banners", bannerRouter);
adminRouter.use("/legal", adminLegalRouter);
adminRouter.use("/settings", settingsRouter);

// Phase 6: uploads, media lifecycle, protected-playback foundation.
adminRouter.use("/uploads", uploadRouter);
adminRouter.use("/media", adminMediaRouter);
adminRouter.use("/content", adminContentMediaRouter);

// Phase 7: billing.
adminRouter.use("/plans", adminPlanRouter);
adminRouter.use("/subscriptions", adminSubscriptionRouter);
adminRouter.use("/payments", adminPaymentRouter);
adminRouter.use("/billing", adminBillingRouter);

// Phase 9: analytics, dashboard, audit logs, settings API.
adminRouter.use("/users", adminUserRouter);
adminRouter.use("/dashboard", adminDashboardRouter);
adminRouter.use("/analytics", adminAnalyticsRouter);
adminRouter.use("/audit-logs", adminAuditLogRouter);
// Announcements: one message to every active customer's notifications.
adminRouter.get("/announcements", asyncHandler(adminAnnouncementController.list));
adminRouter.post("/announcements", validate({ body: createAnnouncementSchema }), asyncHandler(adminAnnouncementController.send));
// Phase 9: per-content stats (nested under /content/:contentId/stats)
adminRouter.get("/content/:contentId/stats", asyncHandler(adminAnalyticsController.titleStats));
// Phase 9: admin settings endpoint (replaces plain settings route for batch PATCH)
const adminSettingsBatchSchema = z.object({
  settings: z.array(z.object({ key: z.string().min(1), value: z.unknown() })).min(1),
});
adminRouter.get("/settings", asyncHandler(publicSettingsController.adminList));
adminRouter.patch("/settings", validate({ body: adminSettingsBatchSchema }), asyncHandler(publicSettingsController.adminUpdateBatch));
