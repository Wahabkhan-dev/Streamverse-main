import type { EmailProvider } from "./types";
import { consoleEmailProvider } from "./console.provider";
import { createResendProvider } from "./resend.provider";
import { logger } from "../../config/logger";

function createEmailProvider(): EmailProvider {
  const provider = process.env["EMAIL_PROVIDER"] ?? "console";
  const from = process.env["EMAIL_FROM"] ?? "noreply@streamverse.com";

  if (provider === "resend") {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) {
      logger.warn("[email] EMAIL_PROVIDER=resend but RESEND_API_KEY not set — falling back to console");
      return consoleEmailProvider;
    }
    logger.info("[email] provider=resend from=" + from);
    return createResendProvider(apiKey, from);
  }

  logger.info("[email] provider=console (development)");
  return consoleEmailProvider;
}

const emailProvider = createEmailProvider();

export { emailProvider };
export type { EmailProvider } from "./types";
