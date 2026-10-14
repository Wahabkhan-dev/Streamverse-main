import { z } from "zod";

export const legalDocTypeSchema = z.enum(["PRIVACY_POLICY", "TERMS_AND_CONDITIONS", "REFUND_POLICY"]);

/** Metadata for one draft save/publish. No admin route exists yet (Phase 4) — this is the shape it will validate. */
export const legalVersionMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1),
  version: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+){0,2}$/, "Use a version like 1.2"),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
  effectiveAt: z.coerce.date().optional(),
});
export type LegalVersionMetadataInput = z.infer<typeof legalVersionMetadataSchema>;
