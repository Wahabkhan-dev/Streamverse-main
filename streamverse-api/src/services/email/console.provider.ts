import type { EmailProvider, PasswordResetPayload, WelcomePayload, BillingNotificationPayload } from "./types";
import { logger } from "../../config/logger";

function safeToken(token: string): string {
  return token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : "[token]";
}

export const consoleEmailProvider: EmailProvider = {
  async sendPasswordReset({ to, resetToken, expiresInMinutes }: PasswordResetPayload) {
    logger.info(`[email:console] password-reset to=${to} token=${safeToken(resetToken)} expires=${expiresInMinutes}m`);
  },
  async sendWelcome({ to, name }: WelcomePayload) {
    logger.info(`[email:console] welcome to=${to} name=${name}`);
  },
  async sendBillingNotification({ to, subject }: BillingNotificationPayload) {
    logger.info(`[email:console] billing-notification to=${to} subject="${subject}"`);
  },
};
