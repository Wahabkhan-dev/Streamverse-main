import { z } from "zod";
import { PURPOSE_RULES } from "../constants/upload";

const purposeEnum = z.enum(Object.keys(PURPOSE_RULES) as [string, ...string[]]);

export const presignUploadSchema = z.object({
  contentId: z.string().min(1).optional(),
  purpose: purposeEnum,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().min(1),
  languageId: z.string().min(1).optional(),
  chapterId: z.string().min(1).optional(),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const completeUploadSchema = z.object({}).optional();

export const idParamSchema = z.object({ assetId: z.string().min(1) });

export const attachMediaParamsSchema = z.object({ contentId: z.string().min(1), assetId: z.string().min(1) });

export const multipartInitiateSchema = presignUploadSchema;
export const multipartPartSchema = z.object({ partNumber: z.number().int().min(1).max(10_000) });
export const multipartCompleteSchema = z.object({ parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) })).min(1) });
export const multipartUploadIdParamSchema = z.object({ uploadId: z.string().min(1) });
