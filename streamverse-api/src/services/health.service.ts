import { pingDatabase } from "../repositories/health.repository";

export interface Readiness {
  ready: boolean;
  checks: Record<string, "ok" | "unavailable">;
}

export const getLiveness = () => ({ status: "ok" as const, uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() });

/** Ready = every dependency this phase needs is reachable. Reports status only, never error text or connection details. */
export async function getReadiness(): Promise<Readiness> {
  const checks: Readiness["checks"] = {};
  try {
    await pingDatabase();
    checks["database"] = "ok";
  } catch {
    checks["database"] = "unavailable";
  }
  return { ready: Object.values(checks).every((c) => c === "ok"), checks };
}
