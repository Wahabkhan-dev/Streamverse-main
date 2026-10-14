import { logger } from "../config/logger";
import { cleanupExpiredAuthData } from "../services/sessionCleanup.service";

/**
 * Not wired to a scheduler yet (no worker/queue infrastructure exists before Phase 6/9). Run this
 * manually (`npx tsx src/jobs/sessionCleanup.job.ts`) or point a cron / worker process at `runOnce()`
 * once one exists.
 */
export async function runOnce() {
  try {
    await cleanupExpiredAuthData();
  } catch (err) {
    logger.error({ err }, "session cleanup job failed");
  }
}

if (require.main === module) void runOnce();
