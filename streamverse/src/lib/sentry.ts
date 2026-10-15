import * as Sentry from "@sentry/react";

const dsn = import.meta.env["VITE_SENTRY_DSN"] as string | undefined;

export function initSentry(): void {
  if (!dsn) {
    console.log("[sentry] VITE_SENTRY_DSN not set — frontend error tracking disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env["MODE"] ?? "development",
    release: import.meta.env["VITE_APP_VERSION"] as string | undefined,
    tracesSampleRate: import.meta.env["MODE"] === "production" ? 0.1 : 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env["MODE"] === "production" ? 0.1 : 0,
    beforeSend(event) {
      // Never send form values that might contain passwords
      if (event.request?.data) {
        event.request.data = "[Redacted]";
      }
      return event;
    },
  });
}

export { Sentry };
