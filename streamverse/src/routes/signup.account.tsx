import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { updateUser, useProfile, useSubscription, useUserHydrated } from "@/lib/user";
import { useSettings } from "@/lib/store";
import { SignupStepper } from "@/components/sv/SignupStepper";
import { SIGNUP_PLAN_KEY } from "./signup.plan";
import { DEMO_MODE } from "@/lib/config";
import { authApi } from "@/api/auth.api";
import { isApiError } from "@/api/client";
import { completeSignIn } from "@/lib/authSession";

export const Route = createFileRoute("/signup/account")({
  head: () => ({ meta: [{ title: "Create Your Account — StreamVerse" }] }),
  component: AccountStep,
});

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-red-500", "bg-warning", "bg-info", "bg-success"];
  return { score, label: labels[score - 1] ?? "Weak", color: colors[score - 1] ?? "bg-red-500" };
}

function AccountStep() {
  const navigate = useNavigate();
  const profile = useProfile();
  const sub = useSubscription();
  const { registration } = useSettings();
  const isGuest = profile.email === "alex@streamverse.tv" && profile.name === "Alex Morgan";
  const isActive = !isGuest && sub.status === "active";

  const hydrated = useUserHydrated();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (isActive) {
      void navigate({ to: "/", replace: true });
      return;
    }
    // Already registered (not guest) but no active sub → skip to payment
    if (!isGuest && !isActive) {
      void navigate({ to: "/signup/payment", replace: true });
      return;
    }
    // Ensure a plan was chosen
    const plan = (() => {
      try {
        return sessionStorage.getItem(SIGNUP_PLAN_KEY);
      } catch {
        return null;
      }
    })();
    if (!plan) {
      void navigate({ to: "/signup/plan", replace: true });
    }
  }, [hydrated, isActive, isGuest, navigate]);

  function field(id: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [id]: v }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e["name"] = "Full name is required.";
    if (!form.email.trim()) e["email"] = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email))
      e["email"] = "Enter a valid email address.";
    if (!form.password) e["password"] = "Password is required.";
    else if (form.password.length < 8) e["password"] = "Password must be at least 8 characters.";
    if (!form.confirm) e["confirm"] = "Please confirm your password.";
    else if (form.confirm !== form.password) e["confirm"] = "Passwords do not match.";
    return e;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    setLoading(true);

    if (DEMO_MODE) {
      await new Promise((r) => setTimeout(r, 700));
      updateUser((s) => ({
        ...s,
        profile: { ...s.profile, name: form.name.trim(), email: form.email },
        subscription: { ...s.subscription, status: "canceled" },
      }));
      setLoading(false);
      void navigate({ to: "/signup/payment" });
      return;
    }

    // Real API registration
    try {
      const res = await authApi.register(form.name.trim(), form.email, form.password);
      completeSignIn(res.data.user, res.data.accessToken);
      // Mirror the new account's subscription state into the browser store for the plan flow
      updateUser((s) => ({ ...s, subscription: { ...s.subscription, status: "canceled" } }));
      setLoading(false);
      void navigate({ to: "/signup/payment" });
    } catch (err) {
      setLoading(false);
      if (isApiError(err)) {
        if (err.status === 409 || err.code === "EMAIL_TAKEN") {
          setErrors({ email: "An account with this email already exists." });
        } else if (err.status === 400) {
          setErrors({ email: err.message });
        } else {
          setErrors({ email: `Registration failed: ${err.message}` });
        }
      } else {
        setErrors({ email: "An unexpected error occurred. Please try again." });
      }
    }
  }

  const strength = passwordStrength(form.password);

  if (!registration) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Registration is currently closed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          New accounts are temporarily unavailable. Please check back soon.
        </p>
        <Link
          to="/sign-in"
          className="mt-6 text-sm font-semibold text-primary-text hover:underline"
        >
          Already have an account? Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 py-10 md:py-16">
      <SignupStepper step={2} />

      <div className="mt-8 max-w-md text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up your StreamVerse account to continue.
        </p>
      </div>

      <div className="mt-8 w-full max-w-[440px]">
        <div className="rounded-2xl border border-border bg-surface-2 p-8 shadow-xl">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Full name */}
            <div className="space-y-1.5">
              <label htmlFor="su-name" className="block text-sm font-medium">
                Full name
              </label>
              <input
                id="su-name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={(e) => field("name", e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {errors["name"] && (
                <p className="text-xs text-red-400" role="alert">
                  {errors["name"]}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="su-email" className="block text-sm font-medium">
                Email address
              </label>
              <input
                id="su-email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => field("email", e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {errors["email"] && (
                <p className="text-xs text-red-400" role="alert">
                  {errors["email"]}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="su-password" className="block text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  id="su-password"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => field("password", e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {form.password.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-colors",
                          i < strength.score ? strength.color : "bg-surface-3",
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{strength.label}</span>
                </div>
              )}
              {errors["password"] && (
                <p className="text-xs text-red-400" role="alert">
                  {errors["password"]}
                </p>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label htmlFor="su-confirm" className="block text-sm font-medium">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="su-confirm"
                  type={showCf ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) => field("confirm", e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowCf((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                  aria-label={showCf ? "Hide password" : "Show password"}
                >
                  {showCf ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors["confirm"] && (
                <p className="text-xs text-red-400" role="alert">
                  {errors["confirm"]}
                </p>
              )}
            </div>

            {/* Legal */}
            <p className="text-xs text-muted-foreground">
              By continuing, you agree to the StreamVerse{" "}
              <Link
                to="/terms-and-conditions"
                className="font-medium text-primary-text hover:underline"
              >
                Terms &amp; Conditions
              </Link>{" "}
              and acknowledge the{" "}
              <Link
                to="/privacy-policy"
                className="font-medium text-primary-text hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/sign-in" className="font-semibold text-primary-text hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <button
          onClick={() => void navigate({ to: "/signup/plan" })}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to plan selection
        </button>
      </div>
    </div>
  );
}
