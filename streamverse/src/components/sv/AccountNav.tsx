import { Link, useRouterState } from "@tanstack/react-router";
import { Bookmark, CreditCard, Download, History, Library, ListPlus, UserRound, Wallet } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** The account pages, in the order of the account menu in the top-right corner. The menu and the tabs on each page share this list. */
export const ACCOUNT_LINKS = [
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/subscription", label: "Subscription", icon: CreditCard },
  { to: "/payment-methods", label: "Payment methods", icon: Wallet },
  { to: "/my-library", label: "My Library", icon: Library },
  { to: "/downloads", label: "Downloads", icon: Download },
  { to: "/my-list", label: "My List", icon: ListPlus },
  { to: "/history", label: "History", icon: History },
  { to: "/notifications", label: "Notifications", icon: Bookmark },
] as const;

/** Whether a page address is one of the account pages (so it gets the tabs). */
export const isAccountPath = (pathname: string) => ACCOUNT_LINKS.some((l) => pathname === l.to || pathname.startsWith(`${l.to}/`));

const tab = "data-[status=active]:bg-primary/15 data-[status=active]:text-foreground data-[status=active]:font-semibold";

/**
 * The account pages with their tabs: a list on the right on large screens, a row of tabs across the top (scrolling sideways, the
 * current one kept in view) on phones. Moving between Profile, Subscription, Downloads... never needs the account menu again.
 */
export function AccountLayout({ children }: { children: ReactNode }) {
  const here = useRouterState({ select: (s) => s.location.pathname });
  const row = useRef<HTMLElement>(null);
  // on phones, keep the current tab visible in the row (the row only scrolls sideways; the page never jumps)
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const box = row.current;
    if (!el || !box || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
  }, [here]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col lg:flex-row">
      <nav
        ref={row}
        aria-label="Your account"
        data-testid="account-nav"
        className="sticky top-[60px] z-30 flex gap-1.5 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur [scrollbar-width:none] lg:order-2 lg:top-[76px] lg:block lg:max-h-[calc(100dvh-96px)] lg:w-64 lg:shrink-0 lg:space-y-1 lg:self-start lg:overflow-y-auto lg:border-b-0 lg:bg-transparent lg:py-8 lg:pr-8 lg:pl-0 lg:backdrop-blur-none [&::-webkit-scrollbar]:hidden"
      >
        <div className="eyebrow mb-2 hidden px-3 text-soft lg:block">Your account</div>
        {ACCOUNT_LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap text-soft transition-colors hover:bg-surface-3 hover:text-foreground max-lg:border max-lg:border-border ${tab}`}
          >
            <l.icon className="size-4 shrink-0" aria-hidden />
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1 lg:order-1">{children}</div>
    </div>
  );
}
