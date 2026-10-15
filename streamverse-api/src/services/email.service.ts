// Email service — delegates to the configured email provider.
// Provider is selected at startup via EMAIL_PROVIDER env var (default: "console").
// Swap to "resend" in production by setting EMAIL_PROVIDER=resend and RESEND_API_KEY.

import { emailProvider } from "./email/index";

export async function sendPasswordReset(payload: {
  to: string;
  subject?: string;
  resetToken: string;
  expiresInMinutes: number;
}): Promise<void> {
  await emailProvider.sendPasswordReset({
    to: payload.to,
    resetToken: payload.resetToken,
    expiresInMinutes: payload.expiresInMinutes,
  });
}

export async function sendWelcomeEmail(payload: {
  to: string;
  subject?: string;
  name?: string;
}): Promise<void> {
  await emailProvider.sendWelcome({
    to: payload.to,
    name: payload.name ?? "there",
  });
}

export async function sendBillingNotification(payload: {
  to: string;
  subject: string;
  body?: string;
  eventType?: string;
  planName?: string;
}): Promise<void> {
  await emailProvider.sendBillingNotification({
    to: payload.to,
    subject: payload.subject,
    body: payload.body ?? payload.subject,
  });
}
