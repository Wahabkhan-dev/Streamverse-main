import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { AgeRestricted, ContentRestricted, ContentUnavailable, ExpiredContent, GeneralError, NetworkError, NotFoundScreen, NotYetAvailable, PaymentFailed, ProcessingFailed, RegionUnavailable, SubscribersOnly, SubscriptionExpired, UploadFailed } from "@/components/sv/states";
import { DEMO_MODE } from "@/lib/demo";

export const Route = createFileRoute("/_site/states")({
  head: () => ({ meta: [{ title: "Screen states — StreamVerse" }, { name: "robots", content: "noindex" }] }),
  component: StatesPage,
});

const say = (m: string) => () => toast(m);

function Card({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section aria-label={name} className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-2.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">{name}</div>
      <div className="max-h-[420px] overflow-auto">{children}</div>
    </section>
  );
}

/** A review page for every error, empty-adjacent and restriction screen. Demo mode only. */
function StatesPage() {
  if (!DEMO_MODE) return <NotFoundScreen />;
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-8 md:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Screen states</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every error and restriction screen in one place, for review. These appear automatically in the real flows.</p>

      <h2 className="mt-8 mb-3 text-lg font-bold">Errors</h2>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card name="Upload failed">
          <UploadFailed file="movie.mkv" reason="The file is larger than the 80 GB limit." onRetry={say("Retry (demo)")} onRemove={say("Removed (demo)")} />
        </Card>
        <Card name="Processing failed">
          <ProcessingFailed file="movie.mp4" onRetry={say("Processing again (demo)")} />
        </Card>
        <Card name="Payment failed">
          <PaymentFailed onUpdate={say("Update payment method (backend required)")} onRetry={say("Retrying payment (demo)")} />
        </Card>
        <Card name="Subscription expired">
          <SubscriptionExpired onRenew={say("Renew plan (demo)")} />
        </Card>
        <Card name="Network error">
          <NetworkError onRetry={say("Trying again (demo)")} />
        </Card>
        <Card name="Content unavailable">
          <ContentUnavailable />
        </Card>
        <Card name="Content restricted">
          <ContentRestricted />
        </Card>
        <Card name="404">
          <NotFoundScreen />
        </Card>
        <Card name="General error">
          <GeneralError onRetry={say("Trying again (demo)")} />
        </Card>
      </div>

      <h2 className="mt-10 mb-3 text-lg font-bold">Restriction screens</h2>
      <div className="grid gap-4 pb-12 lg:grid-cols-2 xl:grid-cols-3">
        <Card name="Age restricted">
          <AgeRestricted minAge={18} title="Neon Requiem" onConfirm={say("Age confirmed (demo)")} />
        </Card>
        <Card name="Subscribers only">
          <SubscribersOnly />
        </Card>
        <Card name="Unavailable in your region">
          <RegionUnavailable country="Canada" />
        </Card>
        <Card name="Not yet available">
          <NotYetAvailable when="2026-12-01" />
        </Card>
        <Card name="Expired / removed">
          <ExpiredContent />
        </Card>
      </div>
    </div>
  );
}
