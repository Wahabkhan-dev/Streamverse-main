import type { Server } from "node:http";
import { createApp } from "./app";
import { disconnectDatabase } from "./config/database";
import { env } from "./config/env";
import { onShutdown, runShutdownHooks } from "./config/lifecycle";
import { logger } from "./config/logger";

const app = createApp();
const server: Server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV, docs: env.docsEnabled }, "StreamVerse API listening");
});

// Registered in the order they are opened; closed in reverse (HTTP first, then workers/Redis, then the database).
onShutdown("database", disconnectDatabase);

let shuttingDown = false;
async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  // hard stop if something refuses to close
  const force = setTimeout(() => {
    logger.error("shutdown timed out; forcing exit");
    process.exit(1);
  }, 10_000);
  force.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await runShutdownHooks();
  process.exit(exitCode);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  void shutdown("uncaughtException", 1);
});
