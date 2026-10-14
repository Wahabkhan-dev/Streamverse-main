// Email service — currently logs only; swap for a real provider before production.
// Tokens are truncated in logs to prevent accidental exposure.

export interface EmailPayload {
  to: string;
  subject: string;
}

export interface PasswordResetPayload extends EmailPayload {
  resetToken: string;
  expiresInMinutes: number;
}

export interface WelcomePayload extends EmailPayload {
  name: string;
}

export interface BillingNotificationPayload extends EmailPayload {
  eventType: "subscription_created" | "subscription_canceled" | "payment_failed" | "payment_succeeded";
  planName?: string;
}

function safeToken(token: string): string {
  return token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : "****";
}

export async function sendPasswordReset(payload: PasswordResetPayload): Promise<void> {
  console.log(`[email] password-reset to=${payload.to} token=${safeToken(payload.resetToken)} expires=${payload.expiresInMinutes}m`);
}

export async function sendWelcomeEmail(payload: WelcomePayload): Promise<void> {
  console.log(`[email] welcome to=${payload.to} name=${payload.name}`);
}

export async function sendBillingNotification(payload: BillingNotificationPayload): Promise<void> {
  console.log(`[email] billing event=${payload.eventType} to=${payload.to} plan=${payload.planName ?? "n/a"}`);
}
