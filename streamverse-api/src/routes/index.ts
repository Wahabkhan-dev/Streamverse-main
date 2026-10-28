import { Router } from "express";
import { adminRouter } from "./admin.routes";
import { audiobookCustomerRouter } from "./audiobookCustomer.routes";
import { authRouter } from "./auth.routes";
import { bannerCustomerRouter } from "./bannerCustomer.routes";
import { collectionCustomerRouter } from "./collectionCustomer.routes";
import { ebookCustomerRouter } from "./ebookCustomer.routes";
import { genreCustomerRouter } from "./genreCustomer.routes";
import { healthRouter } from "./health.routes";
import { homepageCustomerRouter } from "./homepageCustomer.routes";
import { legalCustomerRouter } from "./legalCustomer.routes";
import { hlsDeliveryRouter } from "./hlsDelivery.routes";
import { offlineDeliveryRouter } from "./offlineDelivery.routes";
import { mediaAccessRouter } from "./mediaAccess.routes";
import { movieCustomerRouter } from "./movieCustomer.routes";
import { planRouter } from "./plan.routes";
import { searchRouter } from "./search.routes";
import { userRouter } from "./user.routes";
// Phase 9
import { publicSettingsRouter } from "./publicSettings.routes";

/**
 * Everything under /api/v1. Each phase adds its router here. Routes only define the endpoint, attach
 * middleware and call a controller.
 */
export const apiV1Router = Router();
apiV1Router.use(healthRouter);
apiV1Router.use("/auth", authRouter);
apiV1Router.use("/me", userRouter);
apiV1Router.use("/admin", adminRouter);

// Phase 5: public customer-facing reads (Section 4) — no auth required; detail routes personalize via optionalAuth.
apiV1Router.use("/movies", movieCustomerRouter);
apiV1Router.use("/ebooks", ebookCustomerRouter);
apiV1Router.use("/audiobooks", audiobookCustomerRouter);
apiV1Router.use("/homepage", homepageCustomerRouter);
apiV1Router.use("/collections", collectionCustomerRouter);
apiV1Router.use("/banners", bannerCustomerRouter);
apiV1Router.use("/genres", genreCustomerRouter);
apiV1Router.use("/legal", legalCustomerRouter);
apiV1Router.use("/search", searchRouter);

// Phase 6: protected-media-access foundation (Section 53) — requireAuth itself is inside the router.
// HLS delivery is token-authorised (not bearer), so it must be mounted before the bearer-protected media router.
apiV1Router.use("/media/hls", hlsDeliveryRouter);
apiV1Router.use("/media/offline-file", offlineDeliveryRouter);
apiV1Router.use("/media", mediaAccessRouter);

// Phase 7: public plan pricing list (Section 12).
apiV1Router.use("/plans", planRouter);

// Phase 9: public settings (no auth required).
apiV1Router.use("/settings", publicSettingsRouter);
