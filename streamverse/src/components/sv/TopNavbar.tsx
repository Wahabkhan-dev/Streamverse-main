import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Bookmark, ChevronDown, CreditCard, History, Library, ListPlus, LogOut, Menu, Shield, UserCog, UserRound, Wallet, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEMO_MODE } from "@/lib/demo";
import { markAllNotesRead, markNoteRead, timeAgo, useCustomerNotifications } from "@/lib/notifications";
import { setRole, updateUser, useProfile, useRole, useSubscription } from "@/lib/user";
import { authApi } from "@/api/auth.api";
import { clearAccessToken } from "@/api/client";
import { clearAuthUser } from "@/lib/authState";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { SearchField } from "./SearchField";
import { PlanBadge } from "./ui";

const links = [
  { to: "/", label: "Home" },
  { to: "/movies", label: "Movies" },
  { to: "/ebooks", label: "eBooks" },
  { to: "/audiobooks", label: "Audiobooks" },
  { to: "/my-list", label: "My List" },
] as const;

export const AVATARS = ["bg-red-grad", "bg-gradient-to-br from-info to-ink", "bg-gradient-to-br from-success to-ink", "bg-gradient-to-br from-warning to-primary-deep", "bg-gradient-to-br from-soft to-surface-3 text-ink", "bg-gradient-to-br from-primary-bright to-warning"];
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

export function Avatar({ name, index, className }: { name: string; index: number; className?: string }) {
  return <span className={cn("grid shrink-0 place-items-center rounded-md text-xs font-bold", AVATARS[index % AVATARS.length], className ?? "size-8")}>{initialsOf(name)}</span>;
}

export function TopNavbar() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const notes = useCustomerNotifications();
  const unread = notes.filter((n) => !n.read);
  const profile = useProfile();
  const sub = useSubscription();
  const role = useRole();
  // Guest = seed default or explicitly signed out (email unchanged from factory default)
  const isGuest = profile.email === "alex@streamverse.tv" && profile.name === "Alex Morgan";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-ink/95 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1600px] items-center gap-3 px-4 md:gap-6 md:px-8">
        <button className="grid size-9 place-items-center rounded-md hover:bg-surface-3 lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-5 lg:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/" }}
              className="relative py-5 text-sm font-medium text-soft transition-colors hover:text-foreground data-[status=active]:font-semibold data-[status=active]:text-foreground data-[status=active]:after:absolute data-[status=active]:after:inset-x-0 data-[status=active]:after:bottom-0 data-[status=active]:after:h-0.5 data-[status=active]:after:bg-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <SearchField value={q} onChange={setQ} className="hidden w-64 focus-within:w-80 md:block xl:w-72" onSubmit={(t) => navigate({ to: "/search", search: { q: t } })} id="navbar-search" />
          <Link to="/search" aria-label="Search" className="grid size-9 place-items-center rounded-md text-soft hover:bg-surface-3 hover:text-foreground md:hidden">
            <SearchIcon />
          </Link>
          <Popover>
            <PopoverTrigger className="relative grid size-9 place-items-center rounded-md text-soft hover:bg-surface-3 hover:text-foreground" aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}>
              <Bell className="size-5" />
              {unread.length > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-ink" />}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] border-border bg-surface-2 p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-bold">
                Notifications
                {unread.length > 0 && (
                  <button className="text-xs font-semibold text-primary-text" onClick={() => markAllNotesRead(notes.map((n) => n.key))}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-auto">
                {notes.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</div>}
                {notes.slice(0, 6).map((n) => (
                  <button key={n.key} onClick={() => markNoteRead(n.key)} className="flex w-full gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-surface-3">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-surface-3" : "bg-primary")} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", !n.read && "font-medium")}>{n.t}</span>
                      <span className="block text-xs text-muted-foreground">{n.s}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(n.at)}</span>
                  </button>
                ))}
              </div>
              <Link to="/notifications" className="block border-t border-border px-4 py-2.5 text-center text-xs font-semibold text-primary-text hover:bg-surface-3">
                View all notifications
              </Link>
            </PopoverContent>
          </Popover>
          {isGuest ? (
            <div className="flex items-center gap-2">
              <Link to="/sign-in" className="rounded-md px-3.5 py-1.5 text-sm font-medium text-soft transition hover:bg-surface-3 hover:text-foreground">
                Sign in
              </Link>
              <Link to="/signup" className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-primary/90">
                Sign up
              </Link>
            </div>
          ) : (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-md py-1 pr-1 pl-1 hover:bg-surface-3">
              <span className="sr-only">Account menu</span>
              <Avatar name={profile.name} index={profile.avatar} />
              <span className="hidden text-left xl:block">
                <span className="block text-xs leading-tight font-semibold">{profile.name}</span>
                {sub.status === "expired" || sub.status === "canceled" ? <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-warning uppercase">{sub.status}</span> : <PlanBadge plan={sub.plan} />}
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-border bg-surface-2">
              <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{profile.email}</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/profile">
                  <UserRound /> Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/subscription">
                  <CreditCard /> Subscription
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/payment-methods">
                  <Wallet /> Payment methods
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/my-library">
                  <Library /> My Library
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/my-list">
                  <ListPlus /> My List
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/history">
                  <History /> History
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/notifications">
                  <Bookmark /> Notifications
                </Link>
              </DropdownMenuItem>
              {role === "admin" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/admin/dashboard">
                      <Shield /> Admin console
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {DEMO_MODE && (
                <DropdownMenuItem
                  onSelect={() => {
                    setRole(role === "admin" ? "user" : "admin");
                    toast(role === "admin" ? "Demo: now viewing as a customer" : "Demo: now viewing as an admin");
                  }}
                >
                  <UserCog /> Demo: {role === "admin" ? "switch to customer" : "switch to admin"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  // Always reset local demo state
                  setRole("user");
                  updateUser((s) => ({ ...s, profile: { ...s.profile, name: "Alex Morgan", email: "alex@streamverse.tv" } }));
                  // In real-API mode, also invalidate server session
                  if (!DEMO_MODE) {
                    void authApi.logout().catch(() => { /* best-effort */ });
                    clearAccessToken();
                    clearAuthUser();
                  }
                  toast.success("Signed out");
                  void navigate({ to: "/sign-in" });
                }}
              >
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>
      <div className={cn("border-t border-border bg-ink lg:hidden", open ? "block" : "hidden")}>
        <nav aria-label="Mobile" className="space-y-1 p-4">
          {links.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} activeOptions={{ exact: l.to === "/" }} className="block rounded-md px-3 py-2.5 text-sm text-soft data-[status=active]:bg-surface-3 data-[status=active]:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
