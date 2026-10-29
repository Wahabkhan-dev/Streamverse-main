import { randomBytes } from "node:crypto";
import { argon2Verify, argon2id } from "hash-wasm";

/**
 * Centralized password hashing. Argon2id, with cost parameters above the library defaults. Nothing else
 * in the codebase should call argon2 (or any hashing function) directly — go through this module.
 *
 * Uses the WebAssembly implementation (hash-wasm), not a native addon: the native `argon2` package's prebuilt
 * binary segfaulted on load on the production host. Hashes use the standard encoded `$argon2id$...` format, so
 * they are interchangeable with any other argon2 implementation.
 */
const ARGON2_PARAMS = {
  memorySize: 19456, // KiB, ~19 MB: OWASP's current minimum recommendation for argon2id
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export const hashPassword = (plain: string): Promise<string> =>
  argon2id({ password: plain, salt: randomBytes(16), ...ARGON2_PARAMS, outputType: "encoded" });

/** Never throws on a wrong password — returns false. Only a malformed hash (a bug, not user input) rejects. */
export const verifyPassword = (hash: string, plain: string): Promise<boolean> => argon2Verify({ password: plain, hash });
