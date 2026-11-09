import { defineConfig, devices } from "@playwright/test";

/**
 * LIVE-MODE suite: real backend, real MySQL, real R2, real logins. Requires the frontend to be running with
 * VITE_DEMO_MODE=false and the backend on :4000, started for testing with:
 *   RATE_LIMIT_MULTIPLIER=20 ACCESS_TOKEN_TTL=2h FFMPEG_PATH=... FFPROBE_PATH=...
 * (the multiplier is refused in production; a long access-token TTL keeps one saved login valid for the whole run —
 * refresh tokens rotate, so a saved session can only be refreshed once). The demo-mode suite stays in
 * playwright.config.ts.
 *
 *   npx playwright test -c playwright.live.config.ts
 *
 * Two projects, both normal browsers with web security ON (CORS enforced):
 *   live-chromium      every spec except *.r2.live.spec.ts.
 *   live-r2            *.r2.live.spec.ts: the browser fetches private R2 objects directly (HLS segments, EPUB, PDF) and
 *                      uploads to R2. The bucket's CORS policy allows the app's origin (cors.live.spec.ts proves it).
 *                      These once ran with web security disabled, while that policy was still missing.
 */
export default defineConfig({
  testDir: "./e2e/live",
  testMatch: /.*\.live\.spec\.ts/,
  globalSetup: "./e2e/live/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0, // no retries: a flaky live test is a finding, not something to paper over
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report-live", open: "never" }]],
  outputDir: "test-results-live",
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "live-chromium", testIgnore: /.*\.r2\.live\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "live-r2", testMatch: /.*\.r2\.live\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
