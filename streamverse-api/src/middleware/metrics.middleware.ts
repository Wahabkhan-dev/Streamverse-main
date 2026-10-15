import type { NextFunction, Request, Response } from "express";

// Simple in-process counters — replace with Prometheus/StatsD later
const counters = {
  requests: 0,
  errors5xx: 0,
  errors4xx: 0,
};

const latencyBuckets: number[] = [];

const slowRequestThresholdMs = parseInt(process.env["SLOW_REQUEST_THRESHOLD_MS"] ?? "3000", 10);

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  counters.requests++;

  res.on("finish", () => {
    const ms = Date.now() - start;
    latencyBuckets.push(ms);
    if (latencyBuckets.length > 10000) latencyBuckets.shift();

    if (res.statusCode >= 500) counters.errors5xx++;
    else if (res.statusCode >= 400) counters.errors4xx++;

    // Log slow requests
    if (ms > slowRequestThresholdMs) {
      console.warn(
        `[slow] ${req.method} ${req.path} ${res.statusCode} ${ms}ms requestId=${req.id ?? "unknown"}`,
      );
    }
  });

  next();
}

export function getMetrics() {
  const sorted = [...latencyBuckets].sort((a, b) => a - b);
  const p = (pct: number) => sorted[Math.floor(sorted.length * pct)] ?? 0;
  return {
    requests: counters.requests,
    errors5xx: counters.errors5xx,
    errors4xx: counters.errors4xx,
    latency: { p50: p(0.5), p95: p(0.95), p99: p(0.99) },
  };
}
