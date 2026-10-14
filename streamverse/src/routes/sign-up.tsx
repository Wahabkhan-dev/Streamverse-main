import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/sign-up")({
  head: () => ({ meta: [{ title: "Join StreamVerse" }] }),
  component: SignUpRedirect,
});

// Legacy route — the real signup flow lives at /signup/plan
function SignUpRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/signup/plan", replace: true });
  }, [navigate]);
  return null;
}
