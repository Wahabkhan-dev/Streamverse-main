import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight, BookOpen, CreditCard, Film, Headphones, Sparkles, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { KpiDetailDialog, type KpiDetail } from "@/components/sv/KpiDetailDialog";
import { td, th, tr } from "@/components/sv/admin";
import { CHART_COLORS, Chart } from "@/components/sv/charts";
import { QueryError } from "@/components/sv/QueryError";
import { MetricCard, Panel, PanelHeader, PageHeader, PlanBadge, StatusBadge } from "@/components/sv/ui";
import { useAdminPlatformStatusQuery, useAdminRevenueQuery, useAdminSummaryQuery, useAdminUserGrowthQuery, useAdminUsersQuery, useAdminMoviesQuery, useAdminEbooksQuery, useAdminAudiobooksQuery } from "@/hooks/useAdminApi";
import { compact, usd } from "@/lib/analytics";
import { getAuthUser } from "@/lib/authState";

const quick = [
  { to: "/admin/movies/new", icon: Film, t: "Add new movie", s: "Publish a new film" },
  { to: "/admin/ebooks/new", icon: BookOpen, t: "Add new eBook", s: "Expand your reading shelf" },
  { to: "/admin/audiobooks/new", icon: Headphones, t: "Add new audiobook", s: "Give listeners a new voice" },
] as const;

const month = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

/** Twelve months ending now, as the ISO range the analytics endpoints take. */
function lastYear() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - 11, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** A panel that says what is wrong (and offers a retry) instead of staying empty when its data could not be loaded. */
function Slot({ query, what, children }: { query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }; what: string; children: React.ReactNode }) {
  if (query.isError) return <QueryError error={query.error} what={what} onRetry={() => void query.refetch()} className="my-6" />;
  if (query.isLoading) return <div role="status" aria-busy="true" className="grid h-48 place-items-center text-sm text-muted-foreground">Loading {what.toLowerCase()}…</div>;
  return <>{children}</>;
}

/** The admin overview in live mode: every number and chart comes from the database through the admin API. */
export function LiveDashboard() {
  const range = useMemo(lastYear, []);
  const summary = useAdminSummaryQuery();
  const status = useAdminPlatformStatusQuery();
  const growth = useAdminUserGrowthQuery({ ...range, groupBy: "month" });
  const revenue = useAdminRevenueQuery({ ...range, interval: "month" });
  const movies = useAdminMoviesQuery({ limit: 5 });
  const ebooks = useAdminEbooksQuery({ limit: 5 });
  const audiobooks = useAdminAudiobooksQuery({ limit: 5 });
  const users = useAdminUsersQuery({ limit: 5 });
  const name = getAuthUser()?.fullName?.split(" ")[0];

  const s = summary.data?.data;
  const userChart = useMemo(() => (growth.data?.data.timeSeries ?? []).map((p) => ({ label: month(p.date), Users: p.cumulativeUsers, "New users": p.newUsers })), [growth.data]);
  const revenueChart = useMemo(() => (revenue.data?.data.timeSeries ?? []).map((p) => ({ label: month(p.date), Revenue: Math.round((p.grossCents - p.refundedCents) / 100) })), [revenue.data]);
  const statusChart = s
    ? [{ label: "Published", Titles: s.publishedContent }, { label: "Draft", Titles: s.draftContent }, { label: "Scheduled", Titles: s.scheduledContent }, { label: "Processing", Titles: s.processingContent }, { label: "Archived", Titles: s.archivedContent }]
    : [];

  const recent = useMemo(() => {
    const rows = [
      ...(movies.data?.data ?? []).map((m) => ({ type: "Movie", to: "/movies/$slug", slug: m.slug, title: m.title, status: m.status, at: m.createdAt, image: m.image ?? null })),
      ...(ebooks.data?.data ?? []).map((b) => ({ type: "eBook", to: "/ebooks/$slug", slug: b.slug, title: b.title, status: b.status, at: b.createdAt, image: b.image ?? null })),
      ...(audiobooks.data?.data ?? []).map((b) => ({ type: "Audiobook", to: "/audiobooks/$slug", slug: b.slug, title: b.title, status: b.status, at: b.createdAt, image: b.image ?? null })),
    ];
    return rows.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? ""))).slice(0, 6);
  }, [movies.data, ebooks.data, audiobooks.data]);

  const platform = status.data?.data;
  const rows: Array<{ name: string; ok: boolean; text: string }> = platform
    ? [
        { name: "Database", ok: platform.database === "ok", text: platform.database === "ok" ? "Online" : "Not responding" },
        { name: "Media processing", ok: platform.mediaAssets.failed === 0, text: platform.mediaAssets.failed ? `${platform.mediaAssets.failed} failed` : platform.mediaAssets.processing ? `${platform.mediaAssets.processing} in progress` : "All ready" },
        { name: "Payments (24 hours)", ok: platform.payments.failedLast24h === 0, text: platform.payments.failedLast24h ? `${platform.payments.failedLast24h} failed` : "No failures" },
        { name: "Subscriptions", ok: platform.subscriptions.pastDue === 0, text: platform.subscriptions.pastDue ? `${platform.subscriptions.pastDue} past due` : `${platform.subscriptions.active} active` },
      ]
    : [];
  const allGood = platform ? rows.every((r) => r.ok) : null;

  // Each overview number opens its detail: the figures behind it, the newest few, and a button to the tab that manages it.
  const [openKpi, setOpenKpi] = useState<string | null>(null);
  const titles = (list: typeof movies.data, to: string) =>
    (list?.data ?? []).slice(0, 5).map((t) => ({ key: t.slug, title: t.title, sub: `${t.status === "PUBLISHED" ? "Published" : (t.status ?? "Draft")}${t.createdAt ? ` · added ${new Date(t.createdAt).toLocaleDateString()}` : ""}`, to, params: { slug: t.slug } }));
  const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;
  const kpis: Record<string, KpiDetail> | null = s
    ? {
        movies: { id: "movies", icon: Film, label: "Total movies", value: String(s.totalMovies), about: "Every movie in the catalog, whatever its status. The status counts below cover the whole catalog.", stats: [{ label: "Published", value: String(s.publishedContent) }, { label: "Drafts", value: String(s.draftContent) }, { label: "Scheduled", value: String(s.scheduledContent) }, { label: "Processing", value: String(s.processingContent) }], list: { title: "Newest movies", empty: "No movies yet.", rows: titles(movies.data, "/movies/$slug") }, open: { to: "/admin/movies", label: "Open Movies" } },
        ebooks: { id: "ebooks", icon: BookOpen, label: "Total eBooks", value: String(s.totalEbooks), about: "Every eBook in the catalog, whatever its status. The status counts below cover the whole catalog.", stats: [{ label: "Published", value: String(s.publishedContent) }, { label: "Drafts", value: String(s.draftContent) }, { label: "Scheduled", value: String(s.scheduledContent) }, { label: "Archived", value: String(s.archivedContent) }], list: { title: "Newest eBooks", empty: "No eBooks yet.", rows: titles(ebooks.data, "/ebooks/$slug") }, open: { to: "/admin/ebooks", label: "Open eBooks" } },
        audiobooks: { id: "audiobooks", icon: Headphones, label: "Total audiobooks", value: String(s.totalAudiobooks), about: "Every audiobook in the catalog, whatever its status. The status counts below cover the whole catalog.", stats: [{ label: "Published", value: String(s.publishedContent) }, { label: "Drafts", value: String(s.draftContent) }, { label: "Scheduled", value: String(s.scheduledContent) }, { label: "Archived", value: String(s.archivedContent) }], list: { title: "Newest audiobooks", empty: "No audiobooks yet.", rows: titles(audiobooks.data, "/audiobooks/$slug") }, open: { to: "/admin/audiobooks", label: "Open Audiobooks" } },
        users: { id: "users", icon: Users, label: "Total users", value: s.totalUsers.toLocaleString(), about: "Everyone who has registered.", stats: [{ label: "New this month", value: s.newUsersThisMonth.toLocaleString() }, { label: "With an active plan", value: s.activeSubscriptions.toLocaleString() }], list: { title: "Newest members", empty: "No members yet.", rows: (users.data?.data ?? []).slice(0, 5).map((u) => ({ key: u.id, title: u.name, sub: u.email, to: "/admin/users" })) }, open: { to: "/admin/users", label: "Open Users" } },
        subscriptions: { id: "subscriptions", icon: CreditCard, label: "Active subscriptions", value: s.activeSubscriptions.toLocaleString(), about: "Customers whose plan is paid up and giving them access right now.", stats: [{ label: "Active", value: s.activeSubscriptions.toLocaleString() }, { label: "On a trial", value: s.trialingSubscriptions.toLocaleString() }, { label: "Past due", value: s.pastDueSubscriptions.toLocaleString() }, { label: "Total users", value: s.totalUsers.toLocaleString() }], open: { to: "/admin/subscriptions", label: "Open Subscriptions" } },
        revenue: { id: "revenue", icon: TrendingUp, label: "Revenue this month", value: money(s.revenueThisMonth), about: "Payments received this month, with refunds taken off.", stats: [{ label: "This month", value: money(s.revenueThisMonth) }, { label: "All time", value: money(s.totalRevenueCents) }, { label: "Failed payments (24 hours)", value: platform ? String(platform.payments.failedLast24h) : "…" }, { label: "Past-due subscriptions", value: s.pastDueSubscriptions.toLocaleString() }], open: { to: "/admin/payments", label: "Open Payments" } },
      }
    : null;
  const pick = (id: string) => (kpis ? () => setOpenKpi(id) : undefined);

  return (
    <>
      <PageHeader
        eyebrow="StreamVerse / Overview"
        title={name ? `Welcome back, ${name}.` : "Welcome back."}
        sub="Manage your movies, eBooks, audiobooks, users and platform."
        actions={
          allGood === null ? null : (
            <span className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold ${allGood ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}>
              <span className="size-1.5 rounded-full bg-current" /> {allGood ? "All systems operational" : "Needs attention"}
            </span>
          )
        }
      />

      {summary.isError ? (
        <QueryError error={summary.error} what="The overview numbers" onRetry={() => void summary.refetch()} className="mb-6" />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-busy={summary.isLoading}>
          <MetricCard icon={Film} label="Total movies" value={s ? String(s.totalMovies) : "…"} {...(pick("movies") ? { onClick: pick("movies")! } : {})} />
          <MetricCard icon={BookOpen} label="Total eBooks" value={s ? String(s.totalEbooks) : "…"} {...(pick("ebooks") ? { onClick: pick("ebooks")! } : {})} />
          <MetricCard icon={Headphones} label="Total audiobooks" value={s ? String(s.totalAudiobooks) : "…"} {...(pick("audiobooks") ? { onClick: pick("audiobooks")! } : {})} />
          <MetricCard icon={Users} label="Total users" value={s ? s.totalUsers.toLocaleString() : "…"} {...(pick("users") ? { onClick: pick("users")! } : {})} />
          <MetricCard icon={CreditCard} label="Active subscriptions" value={s ? s.activeSubscriptions.toLocaleString() : "…"} {...(pick("subscriptions") ? { onClick: pick("subscriptions")! } : {})} />
          <MetricCard icon={TrendingUp} label="Revenue this month" value={s ? `$${Math.round(s.revenueThisMonth / 100).toLocaleString()}` : "…"} {...(pick("revenue") ? { onClick: pick("revenue")! } : {})} />
        </div>
      )}
      <KpiDetailDialog kpi={openKpi && kpis ? (kpis[openKpi] ?? null) : null} onClose={() => setOpenKpi(null)} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Panel>
          <PanelHeader title="User Growth" sub="Registered users, last 12 months" />
          <Slot query={growth} what="User growth">
            {userChart.length ? <Chart label="User growth over 12 months" data={userChart} series={[{ key: "Users", name: "Users", color: CHART_COLORS.red }]} format={compact} /> : <p className="p-8 text-center text-sm text-muted-foreground">No sign-ups in this period yet.</p>}
          </Slot>
        </Panel>
        <Panel>
          <PanelHeader title="Quick actions" sub="Make something new." action={<Sparkles className="size-4 text-muted-foreground" />} />
          <div className="p-2">
            {quick.map((q) => (
              <Link key={q.to} to={q.to} className="flex items-center gap-3 rounded-md p-3 hover:bg-surface-3">
                <span className="grid size-9 place-items-center rounded-md bg-primary/12 text-primary-text">
                  <q.icon className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{q.t}</span>
                  <span className="block text-xs text-muted-foreground">{q.s}</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Catalog status" sub="Titles by publishing status" />
          <Slot query={summary} what="Catalog status">
            <Chart label="Titles by status" kind="bar" data={statusChart} series={[{ key: "Titles", name: "Titles", color: CHART_COLORS.red }]} />
          </Slot>
        </Panel>
        <Panel>
          <PanelHeader title="Revenue" sub="Revenue per month, refunds taken off (USD)" />
          <Slot query={revenue} what="Revenue">
            {revenueChart.length ? <Chart label="Revenue by month" kind="bar" data={revenueChart} series={[{ key: "Revenue", name: "Revenue", color: CHART_COLORS.green }]} format={usd} /> : <p className="p-8 text-center text-sm text-muted-foreground">No payments in this period yet.</p>}
          </Slot>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Panel>
          <PanelHeader title="Recent content" sub="Recently added to the catalog" />
          <Slot query={movies} what="Recent content">
            <div className="overflow-x-auto">
              {recent.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Nothing has been added yet. Use a quick action to add the first title.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Title", "Type", "Status", "Added on"].map((h) => (
                        <th key={h} className={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={`${r.type}-${r.slug}`} className={tr}>
                        <td className={`${td} font-semibold`}>
                          {/* the same thumbnail as the admin lists (movie: wide frame, book: square cover) */}
                          <div className="flex items-center gap-3">
                            {r.image ? (
                              <img src={r.image} alt="" className={r.type === "Movie" ? "h-9 w-16 shrink-0 rounded object-cover" : "size-9 shrink-0 rounded object-cover"} />
                            ) : (
                              <div className={r.type === "Movie" ? "h-9 w-16 shrink-0 rounded bg-surface-3" : "size-9 shrink-0 rounded bg-surface-3"} />
                            )}
                            <Link to={r.to as "/movies/$slug"} params={{ slug: r.slug }} className="hover:text-primary-text">{r.title}</Link>
                          </div>
                        </td>
                        <td className={`${td} text-soft`}>{r.type}</td>
                        <td className={td}><StatusBadge status={r.status === "PUBLISHED" ? "Published" : (r.status ?? "Draft")} /></td>
                        <td className={`${td} text-soft`}>{r.at ? new Date(r.at).toLocaleDateString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Slot>
          <Slot query={users} what="Recent members">
            <div className="border-t border-border">
              <div className="px-5 pt-4 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Newest members</div>
              <ul className="divide-y divide-border">
                {(users.data?.data ?? []).slice(0, 4).map((u) => (
                  <li key={u.id}>
                    <Link to="/admin/users" search={{ u: u.id }} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{u.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                      </span>
                      <PlanBadge plan={u.subscriptionStatus ?? "Free"} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Slot>
        </Panel>
        <Panel>
          <PanelHeader title="Platform status" sub="Live checks." action={<Activity className="size-4 text-muted-foreground" />} />
          <Slot query={status} what="Platform status">
            <div className="p-2">
              {rows.map((r) => (
                <div key={r.name} className="flex items-center gap-3 rounded-md px-3 py-2.5">
                  <span className={`size-2 rounded-full ${r.ok ? "bg-success" : "bg-warning"}`} />
                  <span className="flex-1 text-sm font-semibold">{r.name}</span>
                  <span className={`text-xs ${r.ok ? "text-success" : "text-warning"}`}>{r.text}</span>
                </div>
              ))}
            </div>
          </Slot>
        </Panel>
      </div>
    </>
  );
}
