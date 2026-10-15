export interface PasswordResetPayload {
  to: string;
  resetToken: string;
  expiresInMinutes: number;
}

export interface WelcomePayload {
  to: string;
  name: string;
}

export interface BillingNotificationPayload {
  to: string;
  subject: string;
  body: string;
}

export interface EmailProvider {
  sendPasswordReset(payload: PasswordResetPayload): Promise<void>;
  sendWelcome(payload: WelcomePayload): Promise<void>;
  sendBillingNotification(payload: BillingNotificationPayload): Promise<void>;
}
