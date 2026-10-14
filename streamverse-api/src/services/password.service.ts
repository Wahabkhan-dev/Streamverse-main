import argon2, { argon2id, type HashOptions } from "argon2";

/**
 * Centralized password hashing. Argon2id, with cost parameters above the library defaults. Nothing else
 * in the codebase should call argon2 (or any hashing function) directly — go through this module.
 */
const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19456, // ~19 MB, OWASP's current minimum recommendation for argon2id
  timeCost: 2,
  parallelism: 1,
};

export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, ARGON2_OPTIONS);

/** Never throws on a wrong password — returns false. Only a malformed hash (a bug, not user input) rejects. */
export const verifyPassword = (hash: string, plain: string): Promise<boolean> => argon2.verify(hash, plain);
