import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/services/password.service";

describe("password service", () => {
  it("hashes with argon2id and never returns the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain("correct horse battery staple");
  });

  it("verifies a matching password and rejects a wrong one, without throwing", async () => {
    const hash = await hashPassword("right-password");
    await expect(verifyPassword(hash, "right-password")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });

  it("two hashes of the same password are different (random salt) but both verify", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
    await expect(verifyPassword(a, "same-password")).resolves.toBe(true);
    await expect(verifyPassword(b, "same-password")).resolves.toBe(true);
  });

  it("rejects (does not silently pass) a malformed stored hash", async () => {
    await expect(verifyPassword("not-a-real-hash", "anything")).rejects.toBeTruthy();
  });
});
