import { Resend } from "resend";
import type { EmailProvider, PasswordResetPayload, WelcomePayload, BillingNotificationPayload } from "./types";
import { logger } from "../../config/logger";

function safeToken(token: string): string {
  return token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : "[token]";
}

export function createResendProvider(apiKey: string, fromAddress: string): EmailProvider {
  const client = new Resend(apiKey);

  return {
    async sendPasswordReset({ to, resetToken, expiresInMinutes }: PasswordResetPayload) {
      const appUrl = process.env["APP_PUBLIC_URL"] ?? "http://localhost:5173";
      const link = `${appUrl}/reset-password?token=${resetToken}`;
      const { error } = await client.emails.send({
        from: fromAddress,
        to,
        subject: "Reset your StreamVerse password",
        html: [
          "<h2>Password Reset</h2>",
          `<p>Click the link below to reset your password. This link expires in ${expiresInMinutes} minutes.</p>`,
          `<p><a href="${link}">Reset Password</a></p>`,
          `<p>If you did not request this, please ignore this email.</p>`,
          `<p style="font-size:11px;color:#888">Do not share this link.</p>`,
        ].join("\n"),
      });
      if (error) {
        logger.error(`[email:resend] password-reset failed to=${to} token=${safeToken(resetToken)} error=${error.message}`);
        throw new Error(`Email delivery failed: ${error.message}`);
      }
      logger.info(`[email:resend] password-reset sent to=${to} token=${safeToken(resetToken)}`);
    },

    async sendWelcome({ to, name }: WelcomePayload) {
      const { error } = await client.emails.send({
        from: fromAddress,
        to,
        subject: "Welcome to StreamVerse",
        html: `<h2>Welcome, ${name}!</h2><p>Your account is ready. Start watching movies, reading eBooks, and more.</p>`,
      });
      if (error) {
        logger.error(`[email:resend] welcome failed to=${to} name=${name} error=${error.message}`);
        // Non-fatal: welcome email failure should not block registration
      } else {
        logger.info(`[email:resend] welcome sent to=${to}`);
      }
    },

    async sendBillingNotification({ to, subject, body }: BillingNotificationPayload) {
      const { error } = await client.emails.send({
        from: fromAddress,
        to,
        subject,
        html: body,
      });
      if (error) {
        logger.error(`[email:resend] billing-notification failed to=${to} subject="${subject}" error=${error.message}`);
        // Non-fatal
      } else {
        logger.info(`[email:resend] billing-notification sent to=${to}`);
      }
    },
  };
}
