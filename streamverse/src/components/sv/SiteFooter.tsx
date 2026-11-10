import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Loader2, Mail, Twitter, Youtube, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { DEMO_MODE } from "@/lib/config";
import { LEGAL_LINKS } from "@/lib/legal";
import { Logo } from "./Logo";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Social pages come from the environment (VITE_SOCIAL_YOUTUBE ...): an icon is shown only for a page that exists. */
const SOCIAL: { label: string; icon: LucideIcon; url: string | undefined }[] = [
  { label: "YouTube", icon: Youtube, url: import.meta.env["VITE_SOCIAL_YOUTUBE"] as string | undefined },
  { label: "Instagram", icon: Instagram, url: import.meta.env["VITE_SOCIAL_INSTAGRAM"] as string | undefined },
  { label: "X", icon: Twitter, url: import.meta.env["VITE_SOCIAL_X"] as string | undefined },
  { label: "Facebook", icon: Facebook, url: import.meta.env["VITE_SOCIAL_FACEBOOK"] as string | undefined },
];

/** One labelled column of footer links, with a short accent line under the heading. */
function FooterGroup({ title, links }: { title: string; links: readonly (readonly [string, string])[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-xs font-bold tracking-[0.18em] text-foreground uppercase">{title}</h2>
      <span aria-hidden className="mt-2 mb-4 block h-0.5 w-8 rounded-full bg-gradient-to-r from-primary to-transparent" />
      <ul className="space-y-2.5 text-sm">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to as "/"} className="text-muted-foreground transition-colors hover:text-foreground">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The "Stay in the Loop" sign-up card. */
function NewsletterCard() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL.test(value)) return setError("Enter a valid email address.");
    setError("");
    setBusy(true);
    try {
      if (!DEMO_MODE) await api.post("/newsletter/subscribe", { email: value });
      setDone(true);
      setEmail("");
      toast.success("You're on the list");
    } catch {
      setError("We couldn't sign you up just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/10 to-primary/[0.03] p-5 shadow-[0_0_40px_-18px_var(--primary)] backdrop-blur">
      <div className="flex items-center gap-2.5">
        <Mail className="size-5 text-primary-text" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">Stay in the Loop</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Get the latest releases, personalized recommendations, and exclusive offers.</p>
      {done ? (
        <p role="status" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-medium text-foreground">
          Thanks! You're on the list.
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="mt-4">
          <div className="flex items-center gap-1 rounded-xl border border-primary/30 bg-background/50 p-1 focus-within:border-primary">
            <Mail className="ml-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              aria-label="Email address"
              aria-invalid={!!error}
              autoComplete="email"
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-red-grad px-4 py-2 text-sm font-semibold text-primary-foreground shadow-red transition-opacity hover:opacity-90 disabled:opacity-60">
              {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Subscribe
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-primary-text">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

/** A faint film strip with a glowing arc: the footer's decoration (purely visual). */
function FilmGlow() {
  return (
    <svg aria-hidden viewBox="0 0 300 110" className="pointer-events-none absolute -bottom-2 left-0 hidden h-28 w-72 opacity-70 lg:block">
      <defs>
        <linearGradient id="sv-film-fade" x1="0" x2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sv-film-arc" x1="0" x2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--primary)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 40 C70 10 150 70 300 30 L300 80 C150 120 70 60 0 92 Z" fill="url(#sv-film-fade)" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={14 + i * 38} y={36 + Math.sin(i * 0.9) * 8} width="14" height="9" rx="2" fill="var(--primary)" opacity="0.2" />
      ))}
      <polygon points="108,52 108,76 128,64" fill="var(--primary)" opacity="0.45" />
      <path d="M0 100 C90 78 190 78 300 100" fill="none" stroke="url(#sv-film-arc)" strokeWidth="2" />
    </svg>
  );
}

/** The site footer: brand, link columns, the newsletter card, and the bottom bar with social pages. */
export function SiteFooter() {
  const social = SOCIAL.filter((s) => !!s.url);
  return (
    <footer className="relative mt-16 overflow-hidden border-t border-border bg-gradient-to-b from-ink to-background">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="mx-auto max-w-[1600px] px-4 pt-12 md:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_1.5fr] lg:gap-0">
          <div className="relative sm:col-span-2 lg:col-span-1 lg:pr-8 lg:pb-28">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">Movies, eBooks and Audiobooks in one place.</p>
            <FilmGlow />
          </div>
          <div className="lg:border-l lg:border-border lg:px-8">
            <FooterGroup title="Browse" links={[["/movies", "Movies"], ["/ebooks", "eBooks"], ["/audiobooks", "Audiobooks"], ["/collections", "Collections"]]} />
          </div>
          <div className="lg:px-8">
            <FooterGroup title="Account" links={[["/my-list", "My List"], ["/my-library", "My Library"], ["/history", "History"], ["/profile", "Profile"], ["/subscription", "Subscription"], ["/payment-methods", "Payment methods"]]} />
          </div>
          <div className="lg:px-8">
            <FooterGroup title="Legal" links={LEGAL_LINKS.map((l) => [l.to, l.label] as const)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-1 lg:border-l lg:border-border lg:pl-8">
            <NewsletterCard />
          </div>
        </div>
        <div className="mt-10 flex items-center justify-between gap-4 border-t border-border py-5 text-sm text-muted-foreground">
          <p>© 2026 StreamVerse</p>
          {social.length > 0 && (
            <ul className="flex items-center gap-4">
              {social.map((s) => (
                <li key={s.label}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="grid size-8 place-items-center rounded-full transition-colors hover:bg-primary/15 hover:text-foreground">
                    <s.icon className="size-[18px]" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
}
