import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/sv/Logo";
import { authApi } from "@/api/auth.api";
import { DEMO_MODE } from "@/lib/config";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot Password — StreamVerse" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);

    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 700));
      setSent(true);
      setLoading(false);
      return;
    }

    try {
      await authApi.forgotPassword(trimmed);
      setSent(true);
    } catch {
      // Always show success to avoid email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-background">
      <header className="border-b border-border bg-ink px-6 py-4">
        <Logo />
      </header>

      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="rounded-2xl border border-border bg-surface-2 p-8 shadow-xl">
            {sent ? (
              <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  If an account exists for <b>{email}</b>, we've sent a password reset link. Check your inbox and spam folder.
                </p>
                <Link
                  to="/sign-in"
                  className="mt-6 inline-block text-sm font-semibold text-primary-text hover:underline"
                >
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-7 text-center">
                  <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enter your email and we'll send you a reset link.
                  </p>
                </div>

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="fp-email" className="block text-sm font-medium">
                      Email address
                    </label>
                    <input
                      id="fp-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(""); }}
                      placeholder="you@example.com"
                      className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {error && <p className="text-xs text-red-400">{error}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {loading ? "Sending…" : "Send reset link"}
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Remembered it?{" "}
                  <Link to="/sign-in" className="font-semibold text-primary-text hover:underline">
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        © 2026 StreamVerse ·{" "}
        <Link to="/privacy-policy" className="hover:text-foreground">Privacy</Link>{" "}·{" "}
        <Link to="/terms-and-conditions" className="hover:text-foreground">Terms</Link>
      </footer>
    </div>
  );
}
