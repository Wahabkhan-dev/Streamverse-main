import { createFileRoute } from "@tanstack/react-router";
import { PaymentMethodsManager } from "@/components/sv/PaymentMethods";

export const Route = createFileRoute("/_site/payment-methods")({
  head: () => ({ meta: [{ title: "Payment methods — StreamVerse" }, { name: "description", content: "Add, remove and choose the default card for your StreamVerse subscription." }] }),
  component: PaymentMethodsManager,
});
