/**
 * Central feature flags derived from Vite env vars.
 * DEMO_MODE=true  → uses localStorage stores (default / dev)
 * DEMO_MODE=false → uses real backend API (production)
 */
export const DEMO_MODE: boolean = import.meta.env["VITE_DEMO_MODE"] !== "false";

export const API_BASE: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:4000/api/v1";
