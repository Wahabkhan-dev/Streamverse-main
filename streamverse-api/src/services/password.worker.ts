import { argon2Verify, argon2id } from "hash-wasm";

/**
 * Runs inside a worker thread (see password.service.ts). Argon2 is deliberately slow and memory-hard; doing it here instead of
 * on the main thread means a burst of sign-ins no longer stops the server from answering everyone else.
 */
export type PasswordTask =
  | { op: "hash"; password: string; salt: Uint8Array; params: { memorySize: number; iterations: number; parallelism: number; hashLength: number } }
  | { op: "verify"; password: string; hash: string };

export default async function run(task: PasswordTask): Promise<string | boolean> {
  if (task.op === "hash") return argon2id({ password: task.password, salt: task.salt, ...task.params, outputType: "encoded" });
  return argon2Verify({ password: task.password, hash: task.hash });
}
