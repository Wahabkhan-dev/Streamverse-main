import { Router } from "express";
import { z } from "zod";
import * as ageVerificationController from "../controllers/ageVerification.controller";
import * as bookmarkController from "../controllers/bookmark.controller";
import * as historyController from "../controllers/history.controller";
import * as libraryController from "../controllers/library.controller";
import * as myListController from "../controllers/myList.controller";
import * as notificationController from "../controllers/notification.controller";
import * as progressController from "../controllers/progress.controller";
import * as subscriptionController from "../controllers/subscription.controller";
import * as userController from "../controllers/user.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { billingWriteLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { submitAgeVerificationSchema } from "../validators/ageVerification.validator";
import { createBookmarkSchema } from "../validators/bookmark.validator";
import { historyListQuerySchema } from "../validators/history.validator";
import { notificationListQuerySchema } from "../validators/notification.validator";
import { audiobookProgressSchema, ebookProgressSchema, movieProgressSchema } from "../validators/progress.validator";
import { profileUpdateSchema } from "../validators/user.validator";
import { asyncHandler } from "../utils/asyncHandler";
import { deviceRouter } from "./device.routes";
import { paymentMethodRouter } from "./paymentMethod.routes";
import { paymentRouter } from "./payment.routes";
import { playbackSessionRouter } from "./playbackSession.routes";
import { subscriptionRouter } from "./subscription.routes";

const contentIdParam = z.object({ contentId: z.string().min(1) });
const idParam = z.object({ id: z.string().min(1) });
const ebookBookmarkParams = z.object({ ebookId: z.string().min(1) });
const bookmarkParams = z.object({ ebookId: z.string().min(1), bookmarkId: z.string().min(1) });

/**
 * Mounted at /api/v1/me. Everything here requires a valid access token (Section 77): the user is always
 * `req.auth.userId`, never a client-supplied id — nothing below accepts one.
 */
export const userRouter = Router();
userRouter.use(requireAuth);

userRouter.get("/profile", asyncHandler(userController.getProfile));
userRouter.patch("/profile", validate({ body: profileUpdateSchema }), asyncHandler(userController.updateProfile));

userRouter.get("/my-list", asyncHandler(myListController.list));
userRouter.post("/my-list/:contentId", validate({ params: contentIdParam }), asyncHandler(myListController.add));
userRouter.delete("/my-list/:contentId", validate({ params: contentIdParam }), asyncHandler(myListController.remove));

userRouter.get("/library", asyncHandler(libraryController.list));
userRouter.post("/library/:contentId", validate({ params: contentIdParam }), asyncHandler(libraryController.add));
userRouter.delete("/library/:contentId", validate({ params: contentIdParam }), asyncHandler(libraryController.remove));

userRouter.get("/continue", asyncHandler(progressController.continueActivity));
userRouter.get("/progress/movie/:id", validate({ params: idParam }), asyncHandler(progressController.getMovie));
userRouter.put("/progress/movie/:id", validate({ params: idParam, body: movieProgressSchema }), asyncHandler(progressController.putMovie));
userRouter.get("/progress/ebook/:id", validate({ params: idParam }), asyncHandler(progressController.getEbook));
userRouter.put("/progress/ebook/:id", validate({ params: idParam, body: ebookProgressSchema }), asyncHandler(progressController.putEbook));
userRouter.get("/progress/audiobook/:id", validate({ params: idParam }), asyncHandler(progressController.getAudiobook));
userRouter.put("/progress/audiobook/:id", validate({ params: idParam, body: audiobookProgressSchema }), asyncHandler(progressController.putAudiobook));

userRouter.get("/history", validate({ query: historyListQuerySchema }), asyncHandler(historyController.list));
userRouter.delete("/history/:contentId", validate({ params: contentIdParam }), asyncHandler(historyController.remove));

userRouter.get("/ebooks/:ebookId/bookmarks", validate({ params: ebookBookmarkParams }), asyncHandler(bookmarkController.list));
userRouter.post("/ebooks/:ebookId/bookmarks", validate({ params: ebookBookmarkParams, body: createBookmarkSchema }), asyncHandler(bookmarkController.create));
userRouter.delete("/ebooks/:ebookId/bookmarks/:bookmarkId", validate({ params: bookmarkParams }), asyncHandler(bookmarkController.remove));

userRouter.get("/notifications", validate({ query: notificationListQuerySchema }), asyncHandler(notificationController.list));
userRouter.post("/notifications/read-all", asyncHandler(notificationController.markAllRead));
userRouter.post("/notifications/:id/read", validate({ params: idParam }), asyncHandler(notificationController.markRead));
userRouter.delete("/notifications/:id", validate({ params: idParam }), asyncHandler(notificationController.remove));

// Phase 8: age verification.
userRouter.get("/age-verification", asyncHandler(ageVerificationController.getStatus));
userRouter.post("/age-verification", validate({ body: submitAgeVerificationSchema }), asyncHandler(ageVerificationController.submit));

// Phase 7: billing.
userRouter.use("/subscription", subscriptionRouter);
userRouter.use("/payment-methods", paymentMethodRouter);
userRouter.use("/payments", paymentRouter);
userRouter.post("/billing-portal", billingWriteLimiter(), asyncHandler(subscriptionController.billingPortal));

userRouter.use("/devices", deviceRouter);
userRouter.use("/playback-sessions", playbackSessionRouter);
