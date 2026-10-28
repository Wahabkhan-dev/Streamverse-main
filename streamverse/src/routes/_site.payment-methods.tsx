import { createFileRoute } from "@tanstack/react-router";
import { LivePaymentMethods } from "@/components/sv/LivePaymentMethods";
import { PaymentMethodsManager } from "@/components/sv/PaymentMethods";
import { DEMO_MODE } from "@/lib/config";

export const Route = createFileRoute("/_site/payment-methods")({
  head: () => ({ meta: [{ title: "Payment methods — StreamVerse" }, { name: "description", content: "Add, remove and choose the default card for your StreamVerse subscription." }] }),
  component: DEMO_MODE ? PaymentMethodsManager : LivePaymentMethods,
});
