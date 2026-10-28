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
 * Two projects:
 *   live-chromium      a normal browser (CORS enforced).
 *   live-r2-no-cors    ONLY for *.r2.live.spec.ts. Those specs make the browser fetch private R2 objects directly
 *                      (HLS segments, EPUB, PDF). The R2 bucket has no CORS policy yet (BLOCKED EXTERNAL — see
 *                      cors.live.spec.ts), so these run with web-security disabled to verify everything else in the
 *                      chain. Passing here does NOT mean browsers can read R2 in production.
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
    {
      name: "live-r2-no-cors",
      testMatch: /.*\.r2\.live\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--disable-web-security", "--disable-site-isolation-trials"] } },
    },
  ],
});
