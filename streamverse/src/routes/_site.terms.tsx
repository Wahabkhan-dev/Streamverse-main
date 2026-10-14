import { createFileRoute, redirect } from "@tanstack/react-router";

/** Short alias kept for old links. */
export const Route = createFileRoute("/_site/terms")({
  beforeLoad: () => {
    throw redirect({ to: "/terms-and-conditions", replace: true });
  },
});
