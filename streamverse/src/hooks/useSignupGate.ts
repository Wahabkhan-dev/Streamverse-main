import { useAuthState } from "@/lib/authState";
import { DEMO_MODE } from "@/lib/config";
import { useProfile, useSubscription, useUserHydrated } from "@/lib/user";
import { useApiSubscriptionQuery } from "./useApiSubscription";

/**
 * Who is on the signup pages: a guest, a signed-in customer without a membership, or a member (who has nothing to sign up for).
 *
 * Live mode asks the real session and the server's subscription. The browser store is NOT used there: it can still hold the
 * profile of a customer who just signed out (written back by another open tab or a late request), which used to send a
 * signed-out visitor from "Sign up" straight to the home page. Demo mode keeps the browser store, which is all it has.
 */
export function useSignupGate(): { ready: boolean; isGuest: boolean; isActive: boolean } {
  const hydrated = useUserHydrated();
  const profile = useProfile();
  const sub = useSubscription();
  const auth = useAuthState();
  const serverSub = useApiSubscriptionQuery();

  if (DEMO_MODE) {
    const isGuest = profile.email === "alex@streamverse.tv" && profile.name === "Alex Morgan";
    return { ready: hydrated, isGuest, isActive: !isGuest && sub.status === "active" };
  }

  const signedIn = auth.status === "authenticated";
  const status = String((serverSub.data as { status?: string } | undefined)?.status ?? "");
  return {
    // wait for the session check, and for a signed-in customer's subscription, before sending anyone anywhere
    ready: hydrated && auth.status !== "loading" && (!signedIn || !serverSub.isLoading),
    isGuest: !signedIn,
    isActive: signedIn && (status === "ACTIVE" || status === "TRIALING"),
  };
}
