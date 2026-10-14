import { pinoHttp } from "pino-http";
import { logger } from "../config/logger";

/**
 * One structured line per request: requestId, method, route, status, duration (responseTime).
 * Query strings are dropped from the logged url (they can carry tokens) and bodies are never logged.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as { id: string }).id,
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  customSuccessMessage: (req, res) => `${req.method} ${req.url?.split("?")[0]} ${res.statusCode}`,
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: String(req.url ?? "").split("?")[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customProps: (req) => ({ requestId: (req as unknown as { id: string }).id }),
  autoLogging: { ignore: (req) => req.url === "/health" },
});
