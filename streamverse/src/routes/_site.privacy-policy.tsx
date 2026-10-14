import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/sv/LegalPage";

export const Route = createFileRoute("/_site/privacy-policy")({
  head: () => ({ meta: [{ title: "Privacy Policy — StreamVerse" }, { name: "description", content: "What StreamVerse collects, how it is used, and the choices you have." }] }),
  component: () => <LegalPage docKey="privacy-policy" />,
});
