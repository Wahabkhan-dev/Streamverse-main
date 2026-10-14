import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/sv/LegalPage";

export const Route = createFileRoute("/_site/terms-and-conditions")({
  head: () => ({ meta: [{ title: "Terms & Conditions — StreamVerse" }, { name: "description", content: "The rules for using StreamVerse, your account and your subscription." }] }),
  component: () => <LegalPage docKey="terms-and-conditions" />,
});
