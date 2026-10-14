import { Router } from "express";
import * as multipartController from "../controllers/multipartUpload.controller";
import { validate } from "../middleware/validate.middleware";
import { multipartCompleteSchema, multipartInitiateSchema, multipartPartSchema, multipartUploadIdParamSchema } from "../validators/upload.validator";
import { asyncHandler } from "../utils/asyncHandler";

/** Mounted at /api/v1/admin/uploads/multipart — Section 48. Inherits requireAuth + requireRole("ADMIN"). */
export const multipartUploadRouter = Router();

multipartUploadRouter.post("/initiate", validate({ body: multipartInitiateSchema }), asyncHandler(multipartController.initiate));
multipartUploadRouter.post("/:uploadId/part", validate({ params: multipartUploadIdParamSchema, body: multipartPartSchema }), asyncHandler(multipartController.signPart));
multipartUploadRouter.post("/:uploadId/complete", validate({ params: multipartUploadIdParamSchema, body: multipartCompleteSchema }), asyncHandler(multipartController.complete));
multipartUploadRouter.delete("/:uploadId", validate({ params: multipartUploadIdParamSchema }), asyncHandler(multipartController.abort));
