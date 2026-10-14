import { createFileRoute, redirect } from "@tanstack/react-router";

/** Short alias kept for old links. */
export const Route = createFileRoute("/_site/privacy")({
  beforeLoad: () => {
    throw redirect({ to: "/privacy-policy", replace: true });
  },
});
