import { Router } from "express";
import * as uploadController from "../controllers/upload.controller";
import { validate } from "../middleware/validate.middleware";
import { idParamSchema, presignUploadSchema } from "../validators/upload.validator";
import { asyncHandler } from "../utils/asyncHandler";
import { multipartUploadRouter } from "./multipartUpload.routes";

/** Mounted at /api/v1/admin/uploads — inherits requireAuth + requireRole("ADMIN") from admin.routes.ts. */
export const uploadRouter = Router();

uploadRouter.use("/multipart", multipartUploadRouter);
uploadRouter.post("/presign", validate({ body: presignUploadSchema }), asyncHandler(uploadController.presign));
uploadRouter.post("/:assetId/complete", validate({ params: idParamSchema }), asyncHandler(uploadController.complete));
uploadRouter.post("/:assetId/abort", validate({ params: idParamSchema }), asyncHandler(uploadController.abort));
uploadRouter.get("/:assetId/status", validate({ params: idParamSchema }), asyncHandler(uploadController.status));
