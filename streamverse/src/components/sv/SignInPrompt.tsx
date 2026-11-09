import { Link } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import type { MouseEvent } from "react";
import { useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAuthStatus } from "@/lib/authState";
import { rememberReturnTo } from "@/lib/authSession";
import { DEMO_MODE } from "@/lib/config";

/**
 * The "sign in to continue" prompt a signed-out visitor sees when they press Play / Read / Listen or save a title.
 * One prompt for the whole site (mounted once in the _site layout); any button opens it with `guestPrompt(...)`.
 * Nothing protected is requested for a guest: the prompt opens instead of the player, and the server is never asked
 * for a stream or file. (The player routes are still guarded on their own — see AuthGate — for a typed address.)
 */
interface PromptState {
  open: boolean;
  returnTo: string;
  action: string;
}

let state: PromptState = { open: false, returnTo: "/", action: "" };
const listeners = new Set<() => void>();
const setState = (next: PromptState) => {
  state = next;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True when this visitor is known to be signed out (live mode). While the session is still being checked it is NOT a guest. */
export const isKnownGuest = () => !DEMO_MODE && getAuthStatus() === "unauthenticated";

/**
 * For a click handler: if the visitor is signed out, stop the click and open the prompt; returns true when it did.
 * `returnTo` is where they should land after signing in or joining (e.g. the player for this title).
 */
export function guestPrompt(e: MouseEvent | null, returnTo: string, action: string): boolean {
  if (!isKnownGuest()) return false;
  e?.preventDefault();
  e?.stopPropagation();
  setState({ open: true, returnTo, action });
  return true;
}

export function SignInPromptHost() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const close = () => setState({ ...s, open: false });
  return (
    <Dialog open={s.open} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="signin-prompt" className="max-w-sm">
        <DialogHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/15">
            <LogIn className="size-5 text-primary" />
          </div>
          <DialogTitle>Sign in to {s.action || "continue"}</DialogTitle>
          <DialogDescription>Browsing is free. To {s.action || "continue"}, sign in or join StreamVerse.</DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid gap-2">
          <Link
            to="/sign-in"
            search={{ returnTo: s.returnTo }}
            onClick={close}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary-hover"
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            onClick={() => {
              rememberReturnTo(s.returnTo);
              close();
            }}
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface-3 px-5 text-sm font-semibold hover:bg-surface-2"
          >
            Join StreamVerse
          </Link>
          <button type="button" onClick={close} className="h-10 text-sm text-muted-foreground hover:text-foreground">
            Continue browsing
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
