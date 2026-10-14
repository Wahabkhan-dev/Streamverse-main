import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../../src/config/env";
import { issuePasswordResetToken, issueRefreshToken, signAccessToken, verifyAccessToken } from "../../src/services/token.service";
import { sha256Hex } from "../../src/utils/tokens";

describe("access tokens", () => {
  it("round-trips sub and role, and nothing else", () => {
    const token = signAccessToken({ sub: "user-1", role: "USER" });
    const payload = verifyAccessToken(token);
    expect(payload).toEqual({ sub: "user-1", role: "USER" });
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(["aud", "exp", "iat", "iss", "role", "sub"]);
  });

  it("rejects a token signed with the wrong secret", () => {
    const forged = jwt.sign({ sub: "user-1", role: "ADMIN" }, "a-completely-different-secret-value-0001", { issuer: "streamverse-api", audience: "streamverse-frontend", expiresIn: "15m" });
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it("rejects the wrong issuer or audience even with the right secret", () => {
    const wrongIssuer = jwt.sign({ sub: "user-1", role: "USER" }, env.JWT_SECRET, { issuer: "someone-else", audience: "streamverse-frontend", expiresIn: "15m" });
    expect(() => verifyAccessToken(wrongIssuer)).toThrow();
    const wrongAudience = jwt.sign({ sub: "user-1", role: "USER" }, env.JWT_SECRET, { issuer: "streamverse-api", audience: "someone-else", expiresIn: "15m" });
    expect(() => verifyAccessToken(wrongAudience)).toThrow();
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign({ sub: "user-1", role: "USER" }, env.JWT_SECRET, { issuer: "streamverse-api", audience: "streamverse-frontend", expiresIn: -1 });
    expect(() => verifyAccessToken(expired)).toThrow(jwt.TokenExpiredError);
  });

  it("rejects a token with a tampered payload", () => {
    const token = signAccessToken({ sub: "user-1", role: "USER" });
    const [h, _p, s] = token.split(".");
    const tampered = `${h}.${Buffer.from(JSON.stringify({ sub: "user-1", role: "ADMIN" })).toString("base64url")}.${s}`;
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});

describe("opaque tokens (refresh / password reset)", () => {
  it("are random, unique, and only the hash is meant for storage", () => {
    const a = issueRefreshToken();
    const b = issueRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(sha256Hex(a.token));
    expect(a.tokenHash).not.toBe(a.token);
    expect(a.token.length).toBeGreaterThan(40);
  });

  it("set an expiry consistent with configuration", () => {
    const refresh = issueRefreshToken();
    const days = (refresh.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(env.REFRESH_TOKEN_TTL_DAYS - 1);
    expect(days).toBeLessThanOrEqual(env.REFRESH_TOKEN_TTL_DAYS + 0.01);

    const reset = issuePasswordResetToken();
    const minutes = (reset.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(env.PASSWORD_RESET_TOKEN_TTL_MINUTES - 1);
    expect(minutes).toBeLessThanOrEqual(env.PASSWORD_RESET_TOKEN_TTL_MINUTES + 0.01);
  });
});
