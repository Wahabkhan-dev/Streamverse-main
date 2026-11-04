import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Logo } from "@/components/sv/Logo";

export const Route = createFileRoute("/billing/cancel")({
  head: () => ({ meta: [{ title: "Payment cancelled — StreamVerse" }] }),
  component: BillingCancel,
});

function BillingCancel() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <Logo />
      <div className="mt-10 grid size-16 place-items-center rounded-full bg-warning/10 ring-4 ring-warning/25">
        <XCircle className="size-8 text-warning" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Payment cancelled</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">You weren't charged. You can close this window, or get a fresh payment link and try again.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/subscription" className="rounded-lg bg-primary px-6 py-3 text-sm font-bold text-white transition hover:bg-primary/90">
          Get a new payment link
        </Link>
        <Link to="/" className="rounded-lg border border-border px-6 py-3 text-sm font-semibold hover:bg-surface-3">
          Back to StreamVerse
        </Link>
      </div>
    </div>
  );
}
