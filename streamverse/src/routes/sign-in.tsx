import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/sv/Logo";
import { updateUser } from "@/lib/user";
import { DEMO_MODE } from "@/lib/config";
import { authApi } from "@/api/auth.api";
import { setAccessToken } from "@/api/client";
import { setAuthUser } from "@/lib/authState";
import { isApiError } from "@/api/client";

export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign In — StreamVerse" }] }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.email.trim()) e["email"] = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) e["email"] = "Enter a valid email address.";
    if (!form.password) e["password"] = "Password is required.";
    return e;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setLoading(true);

    if (DEMO_MODE) {
      // Demo: accept any credentials, set the profile name from the email prefix
      await new Promise((r) => setTimeout(r, 600));
      updateUser((s) => ({
        ...s,
        profile: { ...s.profile, email: form.email, name: form.email.split("@")[0]! },
      }));
      setLoading(false);
      void navigate({ to: "/" });
      return;
    }

    // Real API login
    try {
      const res = await authApi.login(form.email, form.password);
      setAccessToken(res.data.accessToken);
      setAuthUser(res.data.user);
      // Mirror name/email into the localStorage store so existing UI (profile page, etc.) shows correct data
      updateUser((s) => ({
        ...s,
        role: res.data.user.role,
        profile: {
          ...s.profile,
          email: res.data.user.email,
          name: res.data.user.name,
          ...(res.data.user.country ? { country: res.data.user.country } : {}),
          ...(res.data.user.language ? { language: res.data.user.language } : {}),
          ...(res.data.user.age ? { age: res.data.user.age } : {}),
        },
      }));
      setLoading(false);
      void navigate({ to: "/" });
    } catch (err) {
      setLoading(false);
      if (isApiError(err)) {
        if (err.status === 401 || err.status === 400) {
          setErrors({ password: "Invalid email or password." });
        } else {
          setErrors({ password: `Sign-in failed: ${err.message}` });
        }
      } else {
        setErrors({ password: "An unexpected error occurred. Please try again." });
      }
    }
  }

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-background">
      {/* Header */}
      <header className="border-b border-border bg-ink px-6 py-4">
        <Link to="/"><Logo /></Link>
      </header>

      {/* Card */}
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="rounded-2xl border border-border bg-surface-2 p-8 shadow-xl">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary/15">
                <LogIn className="size-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
              <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to StreamVerse</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {errors["email"] && <p className="text-xs text-red-400">{errors["email"]}</p>}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium">Password</label>
                  <Link to="/forgot-password" className="text-xs font-medium text-primary-text hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground" aria-label={showPw ? "Hide password" : "Show password"}>
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors["password"] && <p className="text-xs text-red-400">{errors["password"]}</p>}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or continue with</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            {/* Google */}
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface-3 px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
            >
              <GoogleIcon />
              Google
            </button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/signup" className="font-semibold text-primary-text hover:underline">
                Join StreamVerse
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        © 2026 StreamVerse ·{" "}
        <Link to="/privacy-policy" className="hover:text-foreground">Privacy</Link>{" "}·{" "}
        <Link to="/terms-and-conditions" className="hover:text-foreground">Terms</Link>
      </footer>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" />
    </svg>
  );
}
