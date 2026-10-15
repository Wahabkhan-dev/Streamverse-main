import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, BookOpen, CreditCard, Download, Eye, Film, Headphones, Sparkles, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { td, th, tr } from "@/components/sv/admin";
import { CHART_COLORS, Chart } from "@/components/sv/charts";
import { DEFAULT_FILTERS, PLATFORM_USERS, buildSeries, compact, planTotals, usd } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import { MetricCard, Panel, PanelHeader, PageHeader, PlanBadge, StatusBadge } from "@/components/sv/ui";
import { BookCover } from "@/components/sv/media";
import { type Book, type Movie } from "@/lib/data";
import { useAudiobooks, useEbooks, useMovies, usePlans, useUsers } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { useAdminDashboardQuery, useAdminMoviesQuery, useAdminEbooksQuery, useAdminAudiobooksQuery, useAdminUsersQuery } from "@/hooks/useAdminApi";

export const Route = createFileRoute("/admin/dashboard")({ component: Dashboard });

const quick = [
  { to: "/admin/movies/new", icon: Film, t: "Add new movie", s: "Publish a new film" },
  { to: "/admin/ebooks/new", icon: BookOpen, t: "Add new eBook", s: "Expand your reading shelf" },
  { to: "/admin/audiobooks/new", icon: Headphones, t: "Add new audiobook", s: "Give listeners a new voice" },
] as const;

const services = ["Website", "Streaming service", "eBook service", "Audiobook service", "Payment gateway", "Database"];

function Dashboard() {
  const demoMovies = useMovies();
  const demoEbooks = useEbooks();
  const demoAudiobooks = useAudiobooks();
  const demoUsers = useUsers();
  const plans = usePlans();
  const { subs: demoSubs, revenue: demoRevenue } = planTotals(plans);

  // Real API hooks (only active when DEMO_MODE=false)
  const apiDashboard = useAdminDashboardQuery();
  const apiMovies = useAdminMoviesQuery({ limit: 1 });
  const apiEbooks = useAdminEbooksQuery({ limit: 1 });
  const apiAudiobooks = useAdminAudiobooksQuery({ limit: 1 });
  const apiUsers = useAdminUsersQuery({ limit: 5 });

  // Dual-mode data selection
  const moviesCount = DEMO_MODE ? demoMovies.length : (apiMovies.data?.meta?.total ?? 0);
  const ebooksCount = DEMO_MODE ? demoEbooks.length : (apiEbooks.data?.meta?.total ?? 0);
  const audiobooksCount = DEMO_MODE ? demoAudiobooks.length : (apiAudiobooks.data?.meta?.total ?? 0);
  const subs = DEMO_MODE ? demoSubs : (apiDashboard.data?.data.activeSubscriptions ?? demoSubs);
  const revenue = DEMO_MODE ? demoRevenue : (apiDashboard.data?.data.totalRevenue ?? demoRevenue);

  // Keep chart data driven by demo counts (charts are illustrative in both modes)
  const movies = DEMO_MODE ? demoMovies : demoMovies;
  const ebooks = DEMO_MODE ? demoEbooks : demoEbooks;
  const audiobooks = DEMO_MODE ? demoAudiobooks : demoAudiobooks;
  const users = DEMO_MODE ? demoUsers : (apiUsers.data?.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    plan: u.subscriptionStatus ?? "Free",
    status: (u.active ? "Active" : "Suspended") as "Active" | "Suspended" | "Inactive",
    joined: u.createdAt.slice(0, 10),
    last: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Unknown",
    country: u.country ?? "",
  }));
  const [recentUsers, setRecentUsers] = useState(false);
  const charts = useMemo(() => {
    const month = { ...DEFAULT_FILTERS, range: "12m" as const, period: "Monthly" as const };
    const total = (n: number, i: number) => Math.max(1, Math.round(n * (0.55 + (0.45 * i) / 11)));
    return {
      users: buildSeries(month, [{ key: "Users", end: PLATFORM_USERS, growth: 0.4, cumulative: true }]),
      // content growth ends at the real catalog size
      content: Array.from({ length: 12 }, (_, i) => ({ label: buildSeries(month, [{ key: "x", end: 1, growth: 0, cumulative: true }])[i]!.label, Movies: total(movies.length, i), eBooks: total(ebooks.length, i), Audiobooks: total(audiobooks.length, i) })),
      engagement: buildSeries(DEFAULT_FILTERS, [
        { key: "Watched", end: 1_840_000, growth: 0.2, cumulative: false },
        { key: "Read", end: 642_000, growth: 0.16, cumulative: false },
        { key: "Listened", end: 428_000, growth: 0.24, cumulative: false },
      ]),
      revenue: buildSeries(month, [{ key: "Revenue", end: revenue, growth: 0.35, cumulative: false }]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies.length, ebooks.length, audiobooks.length, users.length]);

  // newest first: titles are added to the front of each list
  const recent = [
    ...movies.slice(0, 3).map((m) => ({ type: "Movie", item: m as Movie | Book })),
    ...ebooks.slice(0, 2).map((b) => ({ type: "eBook", item: b as Movie | Book })),
    ...audiobooks.slice(0, 2).map((b) => ({ type: "Audiobook", item: b as Movie | Book })),
  ].slice(0, 5);

  return (
    <>
      <PageHeader
        eyebrow="StreamVerse / Overview"
        title="Welcome back, Sam."
        sub="Manage your movies, eBooks, audiobooks, users and platform."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
            <span className="size-1.5 rounded-full bg-current" /> All systems operational
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard icon={Film} label="Total movies" value={String(moviesCount || movies.length)} trend={12.4} />
        <MetricCard icon={BookOpen} label="Total eBooks" value={String(ebooksCount || ebooks.length)} trend={8.2} />
        <MetricCard icon={Headphones} label="Total audiobooks" value={String(audiobooksCount || audiobooks.length)} trend={14.6} />
        <MetricCard icon={Users} label="Total users" value={PLATFORM_USERS.toLocaleString()} trend={6.7} />
        <MetricCard icon={CreditCard} label="Active subscriptions" value={subs.toLocaleString()} trend={4.3} />
        <MetricCard icon={TrendingUp} label="Monthly revenue" value={`$${revenue.toLocaleString()}`} trend={9.8} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Panel>
          <PanelHeader
            title="User Growth"
            sub="Registered users, last 12 months"
            action={
              <button
                className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3"
                aria-label="Export growth report"
                title="Export growth report"
                onClick={() => {
                  const ok = downloadCsv("streamverse-user-growth.csv", [["Month", "Users"], ...charts.users.map((p) => [String(p.label), Number(p["Users"])])]);
                  if (ok) toast.success("Growth report exported");
                  else toast.error("Your browser blocked the download.");
                }}
              >
                <Download className="size-4" />
              </button>
            }
          />
          <Chart label="User growth over 12 months" data={charts.users} series={[{ key: "Users", name: "Users", color: CHART_COLORS.red }]} format={compact} />
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
            <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground">Changes save to this browser</div>
          </div>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Content Growth" sub="Titles in the catalog by type" />
          <Chart
            label="Content growth by type"
            kind="bar"
            stacked
            data={charts.content}
            series={[
              { key: "Movies", name: "Movies", color: CHART_COLORS.red },
              { key: "eBooks", name: "eBooks", color: CHART_COLORS.soft },
              { key: "Audiobooks", name: "Audiobooks", color: CHART_COLORS.amber },
            ]}
          />
        </Panel>
        <Panel>
          <PanelHeader title="Engagement" sub="Daily watching, reading and listening, last 30 days" />
          <Chart
            label="Engagement over 30 days"
            kind="line"
            data={charts.engagement}
            format={compact}
            series={[
              { key: "Watched", name: "Watched", color: CHART_COLORS.red },
              { key: "Read", name: "Read", color: CHART_COLORS.amber },
              { key: "Listened", name: "Listened", color: CHART_COLORS.blue },
            ]}
          />
        </Panel>
        <Panel className="xl:col-span-2">
          <PanelHeader title="Revenue" sub="Revenue per month (USD)" />
          <Chart label="Revenue by month" kind="bar" height={220} data={charts.revenue} series={[{ key: "Revenue", name: "Revenue", color: CHART_COLORS.green }]} format={usd} />
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Panel>
          <PanelHeader
            title={recentUsers ? "Recent users" : "Recent content"}
            sub={recentUsers ? "Latest members on StreamVerse" : "Recently added to the catalog"}
            action={
              <button className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary-text" onClick={() => setRecentUsers(!recentUsers)}>
                Switch view <ArrowRight className="size-3.5" />
              </button>
            }
          />
          <div className="overflow-x-auto">
            {recentUsers ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["User", "Plan", "Joined on", "Status", "Actions"].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.slice(0, 4).map((u) => (
                    <tr key={u.email} className={tr}>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <span className="grid size-8 place-items-center rounded-md bg-surface-3 text-xs font-bold">{u.name.split(" ").map((x) => x[0]).join("")}</span>
                          <div className="min-w-0">
                            <div className="font-semibold">{u.name}</div>
                            <div className="truncate max-w-[180px] text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className={td}><PlanBadge plan={u.plan} /></td>
                      <td className={`${td} text-soft`}>{u.joined}</td>
                      <td className={td}><StatusBadge status={u.status} /></td>
                      <td className={td}>
                        <Link to="/admin/users" search={{ u: u.id }} className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3" aria-label={`View ${u.name}`}>
                          <Eye className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Title", "Type", "Status", "Added on", "Actions"].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map(({ type, item }) => (
                    <tr key={`${type}-${item.slug}`} className={tr}>
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          {type === "Movie" ? <img src={(item as Movie).image} alt="" className="h-9 w-16 rounded object-cover" /> : <BookCover b={item as Book} square className="w-9 rounded" />}
                          <span className="font-semibold">{item.title}</span>
                        </div>
                      </td>
                      <td className={`${td} text-soft`}>{type}</td>
                      <td className={td}><StatusBadge status={item.status} /></td>
                      <td className={`${td} text-soft`}>{(item as Movie).release ?? ((item as Book).year || "-")}</td>
                      <td className={td}>
                        <Link to={(type === "Movie" ? "/movies/$slug" : type === "eBook" ? "/ebooks/$slug" : "/audiobooks/$slug") as "/movies/$slug"} params={{ slug: item.slug }} className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3" aria-label={`Preview ${item.title}`}>
                          <Eye className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Platform status" sub="Everything in its right place." action={<Activity className="size-4 text-muted-foreground" />} />
          <div className="p-2">
            {services.map((n) => (
              <div key={n} className="flex items-center gap-3 rounded-md px-3 py-2.5">
                <span className="size-2 rounded-full bg-success" />
                <span className="flex-1 text-sm font-semibold">{n}</span>
                <span className="text-xs text-success">Online</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
