/**
 * Phase 8: age verification input validation.
 * `dateOfBirth` is accepted as an ISO 8601 date string, validated server-side:
 *  - Not in the future (can't be born tomorrow)
 *  - Not more than 150 years ago (sanity cap)
 */
import { z } from "zod";

const MAX_AGE_YEARS = 150;

export const submitAgeVerificationSchema = z.object({
  dateOfBirth: z
    .string()
    .date("dateOfBirth must be a date in YYYY-MM-DD format")
    .transform((s) => new Date(s))
    .refine((d) => d <= new Date(), { message: "Date of birth cannot be in the future" })
    .refine(
      (d) => {
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - MAX_AGE_YEARS);
        return d >= cutoff;
      },
      { message: `Date of birth cannot be more than ${MAX_AGE_YEARS} years ago` },
    ),
});

export type SubmitAgeVerificationInput = z.infer<typeof submitAgeVerificationSchema>;
