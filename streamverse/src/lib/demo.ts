/**
 * Demo mode: shows a role switch (USER / ADMIN) so the frontend can be reviewed without a login.
 * It is only a frontend convenience. Turn it off with VITE_DEMO_MODE=false once real authentication exists.
 */
export const DEMO_MODE = (import.meta.env?.["VITE_DEMO_MODE"] as string | undefined) !== "false";
