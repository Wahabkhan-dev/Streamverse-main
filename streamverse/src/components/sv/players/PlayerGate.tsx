import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Item } from "@/lib/items";
import { useStoreHydrated } from "@/lib/store";
import { useUserHydrated } from "@/lib/user";
import { DEMO_MODE } from "@/lib/config";
import { useApiSubscriptionQuery } from "@/hooks/useApiSubscription";
import { GateScreen, useGate } from "../Gate";
import { Logo } from "../Logo";
import { ContentUnavailable } from "../states";

/** Waits for saved data (so playback can resume), then applies the restriction screens before a player opens. */
export function PlayerGate({ item, children }: { item: Item | undefined; children: ReactNode }) {
  const storeReady = useStoreHydrated();
  const userReady = useUserHydrated();
  const apiSubQuery = useApiSubscriptionQuery();
  // In API mode, wait for the real subscription check before gating
  const ready = storeReady && userReady && (DEMO_MODE || !apiSubQuery.isLoading);
  const gate = useGate(item);
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-black text-sm text-muted-foreground" aria-busy="true" role="status">
        Loading…
      </div>
    );
  }
  if (!item || gate.kind !== "ok") {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex items-center justify-between px-4 py-4 md:px-8">
          <Logo />
          <Link to="/" className="text-sm font-semibold text-soft hover:text-foreground">
            Back to StreamVerse
          </Link>
        </header>
        {item ? <GateScreen gate={gate} item={item} /> : <ContentUnavailable message="We couldn't find that title." />}
      </div>
    );
  }
  return <>{children}</>;
}

