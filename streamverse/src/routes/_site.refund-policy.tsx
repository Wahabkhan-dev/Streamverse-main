import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/sv/LegalPage";

export const Route = createFileRoute("/_site/refund-policy")({
  head: () => ({ meta: [{ title: "Refund Policy — StreamVerse" }, { name: "description", content: "When subscription charges can be refunded and how to ask." }] }),
  component: () => <LegalPage docKey="refund-policy" />,
});
