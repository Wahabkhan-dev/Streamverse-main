import { z } from "zod";

export const createLanguageSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2,3}(-[a-z]{2,4})?$/, "Use a language code such as en, es, pt-br"),
  name: z.string().trim().min(1).max(60),
});
export type CreateLanguageInput = z.infer<typeof createLanguageSchema>;
