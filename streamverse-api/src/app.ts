import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { buildCorsOptions } from "./config/cors";
import { env } from "./config/env";
import { openApiDocument } from "./docs/openapi";
import { errorHandler } from "./middleware/error.middleware";
import { requestLogger } from "./middleware/logger.middleware";
import { notFound } from "./middleware/notFound.middleware";
import { generalLimiter } from "./middleware/rateLimit.middleware";
import { requestId } from "./middleware/requestId.middleware";
import { healthRouter } from "./routes/health.routes";
import { localStorageRouter } from "./routes/localStorage.routes";
import { webhookRouter } from "./routes/webhook.routes";
import { apiV1Router } from "./routes";
import { maintenanceModeGuard } from "./middleware/maintenanceModeGuard";
import { optionalAuth } from "./middleware/auth.middleware";
import { registerVideoWorker } from "./workers/video.worker";
import { registerAudioWorker } from "./workers/audio.worker";
import { registerCleanupWorker } from "./workers/cleanup.worker";

export interface AppOptions {
  /** override the general limiter (tests) */
  limiter?: express.RequestHandler;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp(options: AppOptions = {}): Express {
  // When running with the inline queue driver (dev/test), the API process is also the worker process.
  // Register handlers here so enqueue() calls are never silently dropped (Bug: handlers were only
  // registered in workers/start.ts, which runs in a separate process under BullMQ).
  if (env.QUEUE_DRIVER !== "bullmq") {
    registerVideoWorker();
    registerAudioWorker();
    registerCleanupWorker();
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(requestId);
  app.use(requestLogger);

  // API docs: own, relaxed CSP (Swagger UI needs inline scripts). Off in production unless API_DOCS_ENABLED=true.
  if (env.docsEnabled) {
    app.use("/api/v1/docs.json", (_req, res) => void res.json(openApiDocument));
    app.use("/api/v1/docs", helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "StreamVerse API" }));
  }

  app.use(helmet());
  app.use(cors(buildCorsOptions()));

  // liveness/readiness first: monitors must not be rate limited or need a body parser
  app.use(healthRouter);

  // Phase 6 (Section 84/85): the local-filesystem storage dev adapter's own static serving — never
  // mounted in production, and never behind STORAGE_PROVIDER other than "local".
  if (!env.isProduction && env.STORAGE_PROVIDER === "local") {
    app.use("/dev/storage", localStorageRouter);
  }

  app.use(options.limiter ?? generalLimiter());

  // Phase 7 (Section 19): Stripe's webhook needs the RAW body for signature verification — mounted here,
  // with its own raw-body parser, strictly before the app's normal express.json() below ever touches it.
  app.use("/api/v1/webhooks", webhookRouter);

  // Body limits: 1 MB covers all valid API payloads; large media never flows through Express (Phase 6: presigned uploads).
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  // unsigned: the refresh token itself is the unguessable secret, so there is nothing a signature adds
  app.use(cookieParser());

  // Phase 9: maintenance mode guard — optionalAuth runs first so req.auth is populated when a
  // valid Bearer token is present, letting ADMINs bypass maintenance mode.
  app.use(optionalAuth);
  app.use(maintenanceModeGuard);

  app.use("/api/v1", apiV1Router);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
