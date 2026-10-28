import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // These unit tests exercise DEMO mode. Pin it so a developer's .env.local (live mode) cannot change what they test;
    // live behaviour is covered by the Playwright specs in e2e/live.
    env: { VITE_DEMO_MODE: "true" },
    testTimeout: 30_000,
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
