/** Centralized email normalization, so it is never scattered across controllers/services. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
