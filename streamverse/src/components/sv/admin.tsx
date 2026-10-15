import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  ChevronLeft,
  CreditCard,
  ExternalLink,
  Film,
  Headphones,
  Home,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  ListTree,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
  Scale,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import { Panel } from "./ui";
import { useAdminNotes } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/demo";
import { setRole } from "@/lib/user";
import { toast } from "sonner";
import { useAudiobooks, useCollections, useEbooks, useMovies, useUsers } from "@/lib/store";

export const adminUser = { name: "Sam Rivera", initials: "SR", role: "ADMIN" };

const nav = [
  { title: "Overview", links: [{ to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Manage Content",
    links: [
      { to: "/admin/movies", label: "Movies", icon: Film },
      { to: "/admin/ebooks", label: "eBooks", icon: BookOpen },
      { to: "/admin/audiobooks", label: "Audiobooks", icon: Headphones },
      { to: "/admin/genres", label: "Genres", icon: ListTree },
      { to: "/admin/collections", label: "Collections", icon: Layers },
      { to: "/admin/homepage", label: "Homepage", icon: Home },
      { to: "/admin/banners", label: "Banners", icon: ImageIcon },
    ],
  },
  {
    title: "People & Billing",
    links: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
      { to: "/admin/payments", label: "Payments", icon: Activity },
    ],
  },
  {
    title: "Platform",
    links: [
      { to: "/admin/analytics", label: "Analytics", icon: ChartNoAxesCombined },
      { to: "/admin/notifications", label: "Notifications", icon: Bell },
      { to: "/admin/legal", label: "Legal & Policies", icon: Scale },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const unread = useAdminNotes().filter((n) => !n.read).length;
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink/70 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-ink transition-all lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0",
          collapsed ? "lg:w-[68px]" : "lg:w-60",
          "w-64",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-border px-4">
          {collapsed ? (
            <Link to="/" aria-label="StreamVerse home" className="grid size-7 place-items-center rounded-md bg-red-grad text-sm font-black shadow-red">
              S
            </Link>
          ) : (
            <Logo />
          )}
          <button className="lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <div className={cn("flex items-center gap-3 border-b border-border px-4 py-3", collapsed && "lg:justify-center lg:px-0")}>
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/12 text-primary-text">
            <ShieldCheck className="size-4" />
          </span>
          <div className={cn("min-w-0", collapsed && "lg:hidden")}>
            <div className="text-sm font-bold">Admin console</div>
            <div className="eyebrow text-[10px] text-muted-foreground">StreamVerse · Admin</div>
          </div>
        </div>
        <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {nav.map((g) => (
            <div key={g.title}>
              <div className={cn("eyebrow mb-1.5 px-2.5 text-[10px] text-muted-foreground", collapsed && "lg:invisible lg:h-0")}>{g.title}</div>
              {g.links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  title={l.label}
                  onClick={onClose}
                  className={cn(
                    "relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-soft transition-colors hover:bg-surface-3 hover:text-foreground",
                    "data-[status=active]:bg-surface-3 data-[status=active]:font-semibold data-[status=active]:text-foreground",
                    "data-[status=active]:before:absolute data-[status=active]:before:inset-y-1.5 data-[status=active]:before:-left-2.5 data-[status=active]:before:w-0.5 data-[status=active]:before:rounded-full data-[status=active]:before:bg-primary",
                    collapsed && "lg:justify-center",
                  )}
                >
                  <l.icon className="size-4 shrink-0" />
                  <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>{l.label}</span>
                  {l.to === "/admin/notifications" && !collapsed && unread > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold">{unread}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-2.5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "hidden h-8 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground lg:flex",
              collapsed && "justify-center",
            )}
          >
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && "Collapse menu"}
          </button>
          <Link to="/" title="Back to StreamVerse" className={cn("flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground", collapsed && "lg:justify-center")}>
            <ExternalLink className="size-4" />
            <span className={cn(collapsed && "lg:hidden")}>Back to StreamVerse</span>
          </Link>
          {DEMO_MODE && (
            <button
              type="button"
              title="Demo: switch to customer view"
              onClick={() => {
                setRole("user");
                toast("Demo: now viewing as a customer");
                navigate({ to: "/" });
              }}
              className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground", collapsed && "lg:justify-center")}
            >
              <LogOut className="size-4" />
              <span className={cn(collapsed && "lg:hidden")}>Switch to customer view</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

type Hit = { key: string; label: string; sub: string; go: () => void };

/** Searches the catalog, collections, genres and users, and opens the match. */
function AdminSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const movies = useMovies();
  const ebooks = useEbooks();
  const audiobooks = useAudiobooks();
  const collections = useCollections();
  const users = useUsers();
  const term = q.trim().toLowerCase();
  const hits: Hit[] = !term
    ? []
    : [
        ...movies.filter((m) => m.title.toLowerCase().includes(term)).slice(0, 3).map((m) => ({ key: `m-${m.slug}`, label: m.title, sub: "Movie", go: () => navigate({ to: "/admin/movies/$slug/edit", params: { slug: m.slug } }) })),
        ...ebooks.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(term)).slice(0, 3).map((b) => ({ key: `e-${b.slug}`, label: b.title, sub: `eBook · ${b.author}`, go: () => navigate({ to: "/admin/ebooks/$slug/edit", params: { slug: b.slug } }) })),
        ...audiobooks.filter((b) => `${b.title} ${b.author} ${b.narrator ?? ""}`.toLowerCase().includes(term)).slice(0, 3).map((b) => ({ key: `a-${b.slug}`, label: b.title, sub: `Audiobook · ${b.author}`, go: () => navigate({ to: "/admin/audiobooks/$slug/edit", params: { slug: b.slug } }) })),
        ...collections.filter((c) => c.name.toLowerCase().includes(term)).slice(0, 2).map((c) => ({ key: `c-${c.id}`, label: c.name, sub: "Collection", go: () => navigate({ to: "/admin/collections", search: { edit: c.id } }) })),
        ...users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(term)).slice(0, 3).map((u) => ({ key: `u-${u.id}`, label: u.name, sub: `User · ${u.email}`, go: () => navigate({ to: "/admin/users", search: { u: u.id } }) })),
      ];
  const pick = (h: Hit) => {
    setOpen(false);
    setQ("");
    h.go();
  };
  return (
    <div className="relative w-full max-w-md" onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (hits[0]) pick(hits[0]);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search anything..."
          aria-label="Search the admin console"
          autoComplete="off"
          className="h-9 w-full rounded-md border border-border bg-surface-2 pr-9 pl-9 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-surface-3">
            <X className="size-4" />
          </button>
        )}
      </form>
      {open && term && (
        <div role="listbox" aria-label="Search results" className="absolute top-full right-0 left-0 z-40 mt-1 max-h-80 overflow-auto rounded-lg border border-border bg-surface-2 py-1 shadow-card">
          {hits.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">No matches for “{q.trim()}”.</div>
          ) : (
            hits.map((h) => (
              <button key={h.key} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-3">
                <span className="min-w-0 truncate font-medium">{h.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{h.sub}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function AdminTopbar({ onMenu }: { onMenu: () => void }) {
  const unread = useAdminNotes().filter((n) => !n.read).length;
  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center gap-4 border-b border-border bg-ink/95 px-4 backdrop-blur md:px-8">
      <button className="grid size-9 place-items-center rounded-md hover:bg-surface-3 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <AdminSearch />
      <div className="ml-auto flex items-center gap-3">
        <Link to="/admin/notifications" className="relative grid size-9 place-items-center rounded-md text-soft hover:bg-surface-3 hover:text-foreground" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-ink" />}
        </Link>
        <span className="hidden h-6 w-px bg-border sm:block" />
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-red-grad text-xs font-bold">{adminUser.initials}</span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs leading-tight font-semibold">{adminUser.name}</span>
            <span className="rounded bg-red-grad px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase">{adminUser.role}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

/* ---------- Shared page bits ---------- */
export function MetricStrip({ items }: { items: { label: string; value: string; note?: string; tone?: "good" | "warn" }[] }) {
  return (
    <div className={cn("mb-6 grid grid-cols-2 gap-3", items.length === 6 ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-4")}>
      {items.map((m) => (
        <Panel key={m.label} className="p-4">
          <div className="text-xs text-muted-foreground">{m.label}</div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight">{m.value}</div>
          {m.note && <div className={cn("mt-0.5 text-xs", m.tone === "good" ? "text-success" : m.tone === "warn" ? "text-warning" : "text-muted-foreground")}>{m.note}</div>}
        </Panel>
      ))}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">{children}</div>;
}
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1 sm:min-w-52 sm:max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-input bg-surface-2 pr-3 pl-9 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
      />
    </div>
  );
}
export function SelectBox({ value, onChange, options, "aria-label": ariaLabel }: { value: string; onChange: (v: string) => void; options: string[]; "aria-label"?: string }) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full min-w-0 rounded-md border border-input bg-surface-2 px-3 text-sm focus:border-primary focus:outline-none"
    >
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

export const th = "h-10 px-5 text-left text-[11px] font-bold tracking-wider text-muted-foreground uppercase";
export const td = "px-5 py-3 align-middle";
export const tr = "border-b border-border transition-colors hover:bg-surface-2";
