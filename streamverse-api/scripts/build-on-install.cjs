#!/usr/bin/env node
/**
 * Hostinger Node.js hosting runs only `npm install` (its "Build command" stays "none") and then looks for dist/server.js.
 * Its install also skips optional packages, and TypeScript 7 ships its Linux compiler as one, so `tsc` cannot run there.
 *
 * This postinstall step finishes the job on Hostinger only: it installs the skipped packages, generates the Prisma client
 * and compiles the API. Everywhere else (local dev, CI, the Docker image, which installs with --ignore-scripts) it does nothing.
 * Trigger: running inside Hostinger's build folder (".../hbuilds/..."), or BUILD_ON_INSTALL=1.
 */
const { execSync } = require("node:child_process");
const path = require("node:path");

const onHostinger = process.cwd().split(path.sep).join("/").includes("/hbuilds/");
if (process.env.BUILD_ON_INSTALL_RUNNING === "1" || !(onHostinger || process.env.BUILD_ON_INSTALL === "1")) process.exit(0);

const env = { ...process.env, BUILD_ON_INSTALL_RUNNING: "1" };
const run = (cmd) => {
  console.log(`[build-on-install] ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
};

run("npm install --include=dev --include=optional --no-audit --no-fund");
run("npx prisma generate");
run("npm run build");
console.log("[build-on-install] dist/server.js is ready");
