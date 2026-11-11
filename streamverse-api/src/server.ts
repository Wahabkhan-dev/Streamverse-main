import type { Server } from "node:http";
import { createApp } from "./app";
import { disconnectDatabase, prisma } from "./config/database";
import { env, validateProductionEnv } from "./config/env";
import { onShutdown, runShutdownHooks } from "./config/lifecycle";
import { logger } from "./config/logger";
import { HOMEPAGE_CACHE_PREFIX, getCustomerHomepage } from "./services/homepage.service";
import { cleanupExpiredAuthData } from "./services/sessionCleanup.service";
import { logReconciliationReport } from "./services/media/reconciliationReport.service";
import { syncAllRuntimes } from "./services/movieRuntime.service";
import { analyticsCache } from "./utils/analyticsCache";

// Refuse to start in production if critical environment variables are absent.
validateProductionEnv();

const app = createApp();
const server: Server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV, docs: env.docsEnabled }, "StreamVerse API listening");
  // Titles saved before runtimes were measured kept a typed runtime: bring them in line with their video files first, so the
  // homepage warmed below does not hold the old numbers.
  const runtimes = syncAllRuntimes().then(
    (n) => void (n && logger.info({ count: n }, "movie runtimes updated from their video files")),
    (err: unknown) => logger.warn({ err }, "movie runtime sync failed"),
  );
  // Fill the public homepage cache now, so the first visitor after a (re)start is served instantly instead of waiting for ~20 queries.
  if (env.HOMEPAGE_CACHE_TTL_SECONDS > 0) {
    void runtimes
      .then(() => getCustomerHomepage(0, 100))
      .then(
        () => logger.info("homepage cache warmed"),
        (err: unknown) => logger.warn({ err }, "homepage cache warm-up failed (will build on first request)"),
      );
    // Keep whatever visitors have recently asked for fresh in the background, so nobody waits for a rebuild (see refreshAging).
    setInterval(() => analyticsCache.refreshAging(HOMEPAGE_CACHE_PREFIX, 10 * 60 * 1000), 10_000).unref();
  }
});

// With the in-process queue a restart kills any conversion that was running, and nothing would ever finish it: the file would
// say "Processing" forever. Mark those files Failed so they can be retried (BullMQ keeps its jobs, so it is left alone).
if (env.QUEUE_DRIVER !== "bullmq") {
  void prisma.mediaAsset
    .updateMany({ where: { status: "PROCESSING", deletedAt: null }, data: { status: "FAILED", processingError: "Processing was interrupted when the server restarted. Use Retry processing." } })
    .then((r) => r.count && logger.warn({ count: r.count }, "marked interrupted media processing as failed"))
    .catch((err: unknown) => logger.error({ err }, "could not recover interrupted media processing"));
}

// Expired and long-revoked sign-in sessions and reset tokens are deleted once a day (every token refresh adds a session row, so
// without this the table only ever grows). Idempotent, so several API instances running it is harmless.
const AUTH_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const runAuthCleanup = () => void cleanupExpiredAuthData().catch((err: unknown) => logger.warn({ err }, "auth cleanup failed (will retry tomorrow)"));
const authCleanupStart = setTimeout(runAuthCleanup, 5 * 60 * 1000);
const authCleanupTimer = setInterval(runAuthCleanup, AUTH_CLEANUP_INTERVAL_MS);
authCleanupStart.unref();
authCleanupTimer.unref();

// Read-only storage/database reconciliation once an hour: it only logs what needs attention (missing objects, unattached
// objects, failed/stuck processing). It never deletes or changes anything; the destructive media cleanup is not scheduled.
const RECONCILE_INTERVAL_MS = 60 * 60 * 1000;
const runReconcileReport = () => void logReconciliationReport().catch((err: unknown) => logger.warn({ err }, "media reconciliation report failed"));
const reconcileStart = setTimeout(runReconcileReport, 10 * 60 * 1000);
const reconcileTimer = setInterval(runReconcileReport, RECONCILE_INTERVAL_MS);
reconcileStart.unref();
reconcileTimer.unref();

// Registered in the order they are opened; closed in reverse (HTTP first, then workers/Redis, then the database).
onShutdown("database", disconnectDatabase);
onShutdown("reconcile-report-timer", () => {
  clearTimeout(reconcileStart);
  clearInterval(reconcileTimer);
});
onShutdown("auth-cleanup-timer", () => {
  clearTimeout(authCleanupStart);
  clearInterval(authCleanupTimer);
});

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
