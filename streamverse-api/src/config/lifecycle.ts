import { logger } from "./logger";

interface Hook {
  name: string;
  close: () => Promise<unknown> | unknown;
}
const hooks: Hook[] = [];

/** Anything that holds a connection (database, Redis, workers) registers here so shutdown can close it. */
export function onShutdown(name: string, close: Hook["close"]) {
  hooks.push({ name, close });
}

/** Closes registered resources in reverse order of registration. One failure does not stop the rest. */
export async function runShutdownHooks() {
  for (const h of [...hooks].reverse()) {
    try {
      await h.close();
      logger.info({ resource: h.name }, "closed");
    } catch (err) {
      logger.error({ err, resource: h.name }, "failed to close");
    }
  }
}
