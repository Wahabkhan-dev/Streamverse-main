import { z } from "zod";

// Trimmed before the format check, so " user@example.com " (a copy-paste space) isn't rejected outright —
// normalizeEmail() still does the real (trim + lowercase) normalization before anything touches the database.
const email = z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.email("Enter a valid email address").max(255));

// Backend is authoritative: the frontend may validate differently, but these rules decide what is accepted.
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => v.trim().length > 0, "Password cannot be blank");

// Public registration can only ever produce a USER: "role" and "status" are not in this schema at all,
// and validate.middleware strips any extra field (including a submitted "role": "ADMIN") before it reaches
// the controller.
export const registerSchema = z.object({
  email,
  password,
  fullName: z.string().trim().min(1, "Full name is required").max(120),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16, "Invalid or expired token"),
  newPassword: password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: password,
});
