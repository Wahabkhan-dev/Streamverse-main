import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";
import { Piscina } from "piscina";
import { onShutdown } from "../config/lifecycle";
import runPasswordTask, { type PasswordTask } from "./password.worker";

/**
 * Centralized password hashing. Argon2id, with cost parameters above the library defaults. Nothing else
 * in the codebase should call argon2 (or any hashing function) directly — go through this module.
 *
 * Uses the WebAssembly implementation (hash-wasm), not a native addon: the native `argon2` package's prebuilt
 * binary segfaulted on load on the production host. Hashes use the standard encoded `$argon2id$...` format, so
 * they are interchangeable with any other argon2 implementation.
 *
 * The hashing runs in a small pool of worker threads (piscina). WebAssembly runs synchronously, so on the main thread every
 * sign-in froze the whole server for its duration: with 20 people signing in, a cached public API fell from ~660 to ~11
 * requests a second. Same algorithm and parameters, same hashes — only where the work runs changed.
 */
const ARGON2_PARAMS = {
  memorySize: 19456, // KiB, ~19 MB: OWASP's current minimum recommendation for argon2id
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

// The compiled server (dist/*.js) has the compiled worker next to it. When running from TypeScript source (tests, seed and admin
// scripts) there is no .js worker to start, so the same function runs in-process, exactly as before.
const workerFile = path.join(__dirname, "password.worker.js");
// At most 4 threads: each running hash holds ~19 MB, and more threads than cores only makes every sign-in slower.
const threads = Math.max(1, Math.min(4, availableParallelism() - 1));
// Started on the first sign-in, so code that merely imports this module never starts a thread.
let pool: Piscina | null | undefined;
function workerPool(): Piscina | null {
  if (pool !== undefined) return pool;
  if (!existsSync(workerFile)) return (pool = null);
  const created = new Piscina({ filename: workerFile, minThreads: 1, maxThreads: threads, idleTimeout: 60_000 });
  onShutdown("password worker pool", () => created.destroy());
  return (pool = created);
}

const run = (task: PasswordTask) => {
  const p = workerPool();
  return p ? (p.run(task) as Promise<string | boolean>) : runPasswordTask(task);
};

export const hashPassword = (plain: string): Promise<string> =>
  run({ op: "hash", password: plain, salt: randomBytes(16), params: ARGON2_PARAMS }) as Promise<string>;

/** Never throws on a wrong password — returns false. Only a malformed hash (a bug, not user input) rejects. */
export const verifyPassword = (hash: string, plain: string): Promise<boolean> => run({ op: "verify", password: plain, hash }) as Promise<boolean>;
