import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/sv/Logo";
import { authApi } from "@/api/auth.api";
import { DEMO_MODE } from "@/lib/config";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset Password — StreamVerse" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s["token"] === "string" ? s["token"] : "",
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  if (!token) {
    return (
      <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-background">
        <header className="border-b border-border bg-ink px-6 py-4">
          <Logo />
        </header>
        <main className="flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface-2 p-8 text-center shadow-xl">
            <h1 className="text-xl font-bold">Invalid reset link</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This password reset link is invalid or has expired.
            </p>
            <Link
              to="/forgot-password"
              className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Request a new link
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (done) {
    return (
      <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-background">
        <header className="border-b border-border bg-ink px-6 py-4">
          <Logo />
        </header>
        <main className="flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface-2 p-8 text-center shadow-xl">
            <h1 className="text-xl font-bold">Password reset</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your password has been updated. You can now sign in with your new password.
            </p>
            <button
              onClick={() => void navigate({ to: "/sign-in" })}
              className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Sign in
            </button>
          </div>
        </main>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (password !== confirm) errs.confirm = "Passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    if (DEMO_MODE) {
      setDone(true);
      toast.success("Password reset (demo)");
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      toast.success("Password updated successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("expired") || msg.includes("invalid")) {
        toast.error("This reset link has expired. Please request a new one.");
      } else if (msg.includes("used")) {
        toast.error("This link has already been used. Please request a new one.");
      } else {
        toast.error("Password reset failed. Please try again.");
      }
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
            <div className="mb-7 text-center">
              <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">Choose a strong password for your account.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="rp-pw" className="block text-sm font-medium">New password</label>
                <div className="relative">
                  <input
                    id="rp-pw"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((v) => { const { password: _p, ...rest } = v; return rest as { password?: string; confirm?: string }; }); }}
                    placeholder="At least 8 characters"
                    className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="rp-cf" className="block text-sm font-medium">Confirm password</label>
                <input
                  id="rp-cf"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setErrors((v) => { const { confirm: _c, ...rest } = v; return rest as { password?: string; confirm?: string }; }); }}
                  placeholder="Repeat password"
                  className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {errors.confirm && <p className="text-xs text-red-400">{errors.confirm}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? "Resetting…" : "Reset password"}
              </button>
            </form>
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
