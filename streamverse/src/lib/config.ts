/**
 * Central feature flags derived from Vite env vars.
 * VITE_DEMO_MODE=true  → uses localStorage stores (a demo deployment / reviewing the UI without a backend)
 * VITE_DEMO_MODE=false → uses the real backend API
 * unset                → the real backend in a production build, demo in development. A production build never falls into
 *                        demo mode just because the variable was forgotten.
 */
export const DEMO_MODE: boolean = demoModeFrom(import.meta.env["VITE_DEMO_MODE"] as string | undefined, import.meta.env.PROD);

export function demoModeFrom(flag: string | undefined, productionBuild: boolean): boolean {
  if (flag === "true") return true;
  if (flag === "false") return false;
  return !productionBuild;
}

export const API_BASE: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:4000/api/v1";
