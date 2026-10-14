import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/signup/")({
  component: SignupIndex,
});

function SignupIndex() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/signup/plan", replace: true });
  }, [navigate]);
  return null;
}
