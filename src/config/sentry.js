// Sentry APM integration — optional, gracefully skipped if SENTRY_DSN is not set.
//
// Required environment variable:
//   SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
//
// Optional:
//   NODE_ENV=production  — enables 20% trace sampling rate (vs 100% in dev)
//
// To enable: add SENTRY_DSN to your .env file.
// When SENTRY_DSN is absent the module is loaded but init() is a no-op,
// so no crashes occur in environments without Sentry configured.

import * as Sentry from "@sentry/node";

export const initSentry = () => {
  if (!process.env.SENTRY_DSN) return; // gracefully skip if not configured
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    integrations: [
      Sentry.mongooseIntegration(),
    ],
  });
};

export { Sentry };
