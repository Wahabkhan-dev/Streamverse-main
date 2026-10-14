import { describe, expect, it } from "vitest";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "../../src/validators/auth.validator";
import { profileUpdateSchema } from "../../src/validators/user.validator";

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "longenough", fullName: "Alex" }).success).toBe(true);
  });

  it("strips role/status/anything else, even if sent — there is no way to request ADMIN here", () => {
    const parsed = registerSchema.parse({ email: "a@b.com", password: "longenough", fullName: "Alex", role: "ADMIN", status: "ACTIVE", isAdmin: true });
    expect(parsed).toEqual({ email: "a@b.com", password: "longenough", fullName: "Alex" });
    expect(parsed).not.toHaveProperty("role");
  });

  it("rejects an invalid email and a short/blank password", () => {
    expect(registerSchema.safeParse({ email: "not-an-email", password: "longenough", fullName: "Alex" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "short", fullName: "Alex" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "        ", fullName: "Alex" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "longenough", fullName: "" }).success).toBe(false);
  });
});

describe("other auth schemas", () => {
  it("loginSchema requires email and a non-empty password only", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
  it("forgotPasswordSchema requires a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
  it("resetPasswordSchema requires a token and a strong-enough new password", () => {
    expect(resetPasswordSchema.safeParse({ token: "a".repeat(32), newPassword: "longenough" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "short", newPassword: "longenough" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "a".repeat(32), newPassword: "short" }).success).toBe(false);
  });
  it("changePasswordSchema requires both passwords", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "longenough" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ newPassword: "longenough" }).success).toBe(false);
  });
});

describe("profileUpdateSchema", () => {
  it("accepts editable fields and silently drops role/status/email/passwordHash", () => {
    const parsed = profileUpdateSchema.parse({ fullName: "New Name", country: "us", role: "ADMIN", status: "SUSPENDED", email: "new@b.com", passwordHash: "x" });
    expect(parsed).toEqual({ fullName: "New Name", country: "US" });
  });
  it("every field is optional, and an empty body is valid (a no-op update)", () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(true);
  });
  it("rejects an out-of-range preference", () => {
    expect(profileUpdateSchema.safeParse({ audiobookSpeed: 10 }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ videoQuality: "8K" }).success).toBe(false);
  });
});
