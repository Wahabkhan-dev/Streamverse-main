import { describe, expect, it } from "vitest";
import { buildEnv } from "../../src/config/env";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  FRONTEND_URL: "http://localhost:5173",
  JWT_SECRET: "a".repeat(40),
  JWT_REFRESH_SECRET: "b".repeat(40),
  STRIPE_SECRET_KEY: "sk_test_" + "c".repeat(32),
  STRIPE_WEBHOOK_SECRET: "whsec_" + "d".repeat(32),
  STRIPE_SUCCESS_URL: "http://localhost:5173/billing/success",
  STRIPE_CANCEL_URL: "http://localhost:5173/billing/cancel",
} as NodeJS.ProcessEnv;

describe("environment validation", () => {
  it("accepts a complete development config and fills defaults", () => {
    const e = buildEnv(base);
    expect(e.PORT).toBe(4000);
    expect(e.docsEnabled).toBe(true);
    expect(e.allowedOrigins).toEqual(["http://localhost:5173"]);
  });

  it("fails fast and lists every missing or invalid value", () => {
    expect(() => buildEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL[\s\S]*FRONTEND_URL[\s\S]*JWT_SECRET/);
    expect(() => buildEnv({ ...base, JWT_SECRET: "short" })).toThrow(/JWT_SECRET must be at least 32/);
    expect(() => buildEnv({ ...base, DATABASE_URL: "mysql://x" })).toThrow(/postgresql/);
  });

  it("rejects wildcard and malformed CORS origins", () => {
    expect(() => buildEnv({ ...base, ALLOWED_ORIGINS: "*" })).toThrow(/not a valid origin/);
    expect(() => buildEnv({ ...base, ALLOWED_ORIGINS: "http://a.com/path" })).toThrow(/not a valid origin/);
    expect(buildEnv({ ...base, ALLOWED_ORIGINS: "http://a.com/, http://b.com" }).allowedOrigins).toEqual(["http://localhost:5173", "http://a.com", "http://b.com"]);
  });

  it("treats empty optional values as unset", () => {
    const e = buildEnv({ ...base, STRIPE_PORTAL_RETURN_URL: "", REDIS_URL: "", AWS_ENDPOINT: "" });
    expect(e.STRIPE_PORTAL_RETURN_URL).toBeUndefined();
    expect(e.REDIS_URL).toBeUndefined();
  });

  it("is stricter in production: https only, real secrets, docs off by default", () => {
    const prod = { ...base, NODE_ENV: "production", FRONTEND_URL: "https://streamverse.example.org", STRIPE_SECRET_KEY: "sk_live_" + "e".repeat(32) } as NodeJS.ProcessEnv;
    expect(() => buildEnv({ ...prod, JWT_SECRET: "change-me-".repeat(5) })).toThrow(/placeholder/);
    expect(() => buildEnv({ ...prod, JWT_REFRESH_SECRET: base["JWT_SECRET"]! })).toThrow(/must differ/);
    expect(() => buildEnv({ ...prod, FRONTEND_URL: "http://streamverse.org" })).toThrow(/https/);
    const ok = buildEnv(prod);
    expect(ok.docsEnabled).toBe(false);
    expect(ok.logLevel).toBe("info");
    expect(buildEnv({ ...prod, API_DOCS_ENABLED: "true" }).docsEnabled).toBe(true);
  });
});
