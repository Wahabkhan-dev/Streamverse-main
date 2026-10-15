import type { EmailProvider, PasswordResetPayload, WelcomePayload, BillingNotificationPayload } from "./types";

function safeToken(token: string): string {
  return token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : "[token]";
}

export const consoleEmailProvider: EmailProvider = {
  async sendPasswordReset({ to, resetToken, expiresInMinutes }: PasswordResetPayload) {
    console.log(`[email:console] password-reset to=${to} token=${safeToken(resetToken)} expires=${expiresInMinutes}m`);
  },
  async sendWelcome({ to, name }: WelcomePayload) {
    console.log(`[email:console] welcome to=${to} name=${name}`);
  },
  async sendBillingNotification({ to, subject }: BillingNotificationPayload) {
    console.log(`[email:console] billing-notification to=${to} subject="${subject}"`);
  },
};
