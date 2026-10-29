// Startup diagnostic for the segfault: set DIAG=1 on the host. Prints each step BEFORE it runs, so the last line
// in the log is the step that crashed. Not used in normal operation.
const fs = require("node:fs");
const say = (m) => fs.writeSync(1, `[diag] ${m}\n`);
(async () => {
  say(`node ${process.version} ${process.platform} ${process.arch}`);
  say("1. require argon2"); const argon2 = require("argon2");
  say("2. argon2.hash"); await argon2.hash("test");
  say("3. require @prisma/client"); const { PrismaClient } = require("@prisma/client");
  say("4. new PrismaClient"); const prisma = new PrismaClient();
  say("5. prisma $connect"); await prisma.$connect();
  say("6. prisma SELECT 1"); await prisma.$queryRaw`SELECT 1`;
  say("7. require dist/config/env"); require("./dist/config/env");
  say("8. require dist/app"); const { createApp } = require("./dist/app");
  say("9. createApp"); createApp();
  say("10. bullmq"); require("bullmq");
  say("11. ioredis"); require("ioredis");
  say("12. stripe"); require("stripe");
  say("13. @aws-sdk/client-s3"); require("@aws-sdk/client-s3");
  say("ALL OK - no crash in any step");
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { say(`ERROR: ${e && e.stack || e}`); process.exit(1); });
