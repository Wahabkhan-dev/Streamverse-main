import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Logo } from "@/components/sv/Logo";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Join StreamVerse" }] }),
  component: SignupLayout,
});

function SignupLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-ink px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/">
            <Logo />
          </Link>
          <Link
            to="/sign-in"
            className="text-sm font-medium text-soft transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>

      <footer className="shrink-0 border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        © 2026 StreamVerse ·{" "}
        <Link to="/privacy-policy" className="hover:text-foreground">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link to="/terms-and-conditions" className="hover:text-foreground">
          Terms
        </Link>{" "}
        ·{" "}
        <Link to="/refund-policy" className="hover:text-foreground">
          Refund Policy
        </Link>
      </footer>
    </div>
  );
}
