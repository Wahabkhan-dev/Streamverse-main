import pino from "pino";
import { env } from "./env";

/** Values that must never reach a log line, wherever they appear. */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.password",
  "*.newPassword",
  "*.currentPassword",
  "*.passwordHash",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.secret",
  "*.cardNumber",
  "*.cvc",
  "*.cvv",
  "*.clientSecret",
];

export const logger = pino({
  level: env.logLevel,
  base: { service: "streamverse-api", env: env.NODE_ENV },
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === "development" ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } } : {}),
});
