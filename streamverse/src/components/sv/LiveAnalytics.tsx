import { BookOpen, CreditCard, Download, Film, Headphones, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ApiRevenueSeries, ApiUserGrowth } from "@/api/types";
import { SelectBox } from "@/components/sv/admin";
import { CHART_COLORS, Chart } from "@/components/sv/charts";
import { QueryError } from "@/components/sv/QueryError";
import { Btn, EmptyState, MetricCard, PageHeader, Panel, PanelHeader, Tag } from "@/components/sv/ui";
import { useAdminReportQuery } from "@/hooks/useAdminApi";
import { compact, usd } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";

const RANGES = [
  { label: "Last 7 days", id: "7d" },
  { label: "Last 30 days", id: "30d" },
  { label: "Last 90 days", id: "90d" },
  { label: "This year", id: "this_year" },
] as const;
const TYPES = [
  { label: "All", id: "all" },
  { label: "Movies", id: "Movie" },
  { label: "eBooks", id: "eBook" },
  { label: "Audiobooks", id: "Audiobook" },
] as const;
const PERIODS = [
  { label: "Daily", id: "day" },
  { label: "Weekly", id: "week" },
  { label: "Monthly", id: "month" },
] as const;

interface Sub {
  activeCount: number;
  trialingCount: number;
  canceledCount: number;
  pastDueCount: number;
  newInPeriod: number;
  churnInPeriod: number;
  planDistribution: Array<{ planId: string; planName: string; count: number }>;
}
interface Engagement {
  totalStarts: number;
  completions: number;
}
interface TopRow {
  contentId: string;
  title: string;
  contentType: string;
  count: number;
}
interface GenreRow {
  genre: string;
  starts: number;
  uniqueUsers: number;
  contentCount: number;
}

const label = (iso: string, period: string) => {
  const d = new Date(iso);
  return period === "month" ? d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function Slot({ query, what, children }: { query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }; what: string; children: React.ReactNode }) {
  if (query.isError) return <QueryError error={query.error} what={what} onRetry={() => void query.refetch()} className="my-6" />;
  if (query.isLoading) return <div role="status" aria-busy="true" className="grid h-48 place-items-center text-sm text-muted-foreground">Loading {what.toLowerCase()}…</div>;
  return <>{children}</>;
}

/** Analytics in live mode: every figure is computed by the backend from real sign-ups, payments and viewing progress. */
export function LiveAnalytics() {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("30d");
  const [type, setType] = useState<(typeof TYPES)[number]["id"]>("all");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("day");

  const users = useAdminReportQuery<ApiUserGrowth>("users", { range, groupBy: period });
  const revenue = useAdminReportQuery<ApiRevenueSeries>("revenue", { range, groupBy: period });
  const subs = useAdminReportQuery<Sub>("subscriptions", { range });
  const movies = useAdminReportQuery<Engagement>("movies", { range });
  const ebooks = useAdminReportQuery<Engagement>("ebooks", { range });
  const audio = useAdminReportQuery<Engagement>("audiobooks", { range });
  const top = useAdminReportQuery<TopRow[]>("top-content", { range, contentType: type, metric: "starts", limit: "5" });
  const genres = useAdminReportQuery<GenreRow[]>("top-genres", { range, contentType: type });

  const userChart = useMemo(() => (users.data?.timeSeries ?? []).map((p) => ({ label: label(p.date, period), Users: p.cumulativeUsers, "New users": p.newUsers })), [users.data, period]);
  const revenueChart = useMemo(() => (revenue.data?.timeSeries ?? []).map((p) => ({ label: label(p.date, period), Revenue: Math.round((p.grossCents - p.refundedCents) / 100) })), [revenue.data, period]);
  const planChart = (subs.data?.planDistribution ?? []).map((p) => ({ label: p.planName, Subscribers: p.count }));
  const genreTotal = (genres.data ?? []).reduce((a, g) => a + g.starts, 0) || 1;
  const show = (t: (typeof TYPES)[number]["id"]) => type === "all" || type === t;

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Period", "New users", "Total users", "Revenue (USD)"]];
    (users.data?.timeSeries ?? []).forEach((p, i) => rows.push([p.date.slice(0, 10), p.newUsers, p.cumulativeUsers, revenueChart[i]?.Revenue ?? 0]));
    if (downloadCsv(`streamverse-analytics-${range}.csv`, rows)) toast.success("Analytics exported");
    else toast.error("Your browser blocked the download.");
  };

  return (
    <>
      <PageHeader
        title="Analytics"
        sub="What people are watching, reading and listening to, taken from real activity on the platform."
        actions={
          <Btn onClick={exportCsv} disabled={!users.data}>
            <Download /> Export CSV
          </Btn>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4 lg:grid-cols-3">
        {(
          [
            ["Date Range", RANGES.find((r) => r.id === range)!.label, RANGES.map((r) => r.label), (v: string) => setRange(RANGES.find((r) => r.label === v)!.id)],
            ["Content Type", TYPES.find((t) => t.id === type)!.label, TYPES.map((t) => t.label), (v: string) => setType(TYPES.find((t) => t.label === v)!.id)],
            ["Time Period", PERIODS.find((p) => p.id === period)!.label, PERIODS.map((p) => p.label), (v: string) => setPeriod(PERIODS.find((p) => p.label === v)!.id)],
          ] as const
        ).map(([name, value, options, onChange]) => (
          <label key={name} className="block min-w-0">
            <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{name}</span>
            <SelectBox value={value} onChange={onChange} options={[...options]} aria-label={name} />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard icon={Users} label="New users" value={users.data ? compact(users.data.totalNewUsers) : "…"} />
        <MetricCard icon={CreditCard} label="Active subscriptions" value={subs.data ? compact(subs.data.activeCount) : "…"} />
        <MetricCard icon={TrendingUp} label="Net revenue" value={revenue.data ? usd(revenue.data.netRevenueCents / 100) : "…"} />
        <MetricCard icon={Film} label="Movies started" value={movies.data ? compact(movies.data.totalStarts) : "…"} />
        <MetricCard icon={BookOpen} label="eBooks started" value={ebooks.data ? compact(ebooks.data.totalStarts) : "…"} />
        <MetricCard icon={Headphones} label="Audiobooks started" value={audio.data ? compact(audio.data.totalStarts) : "…"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="User Growth" sub="Registered users over time" />
          <Slot query={users} what="User growth">
            {userChart.length ? <Chart label="User growth" data={userChart} series={[{ key: "Users", name: "Users", color: CHART_COLORS.red }]} format={compact} /> : <EmptyState title="No data" sub="No users in this period." />}
          </Slot>
        </Panel>
        <Panel>
          <PanelHeader title="Revenue" sub="Revenue per period, refunds taken off (USD)" />
          <Slot query={revenue} what="Revenue">
            {revenueChart.some((p) => p.Revenue) ? <Chart label="Revenue" kind="bar" data={revenueChart} series={[{ key: "Revenue", name: "Revenue", color: CHART_COLORS.green }]} format={usd} /> : <EmptyState title="No payments" sub="No payments were taken in this period." />}
          </Slot>
        </Panel>
        <Panel>
          <PanelHeader title="Subscribers by plan" sub="Current subscriptions" />
          <Slot query={subs} what="Subscriptions">
            {planChart.length ? <Chart label="Subscribers by plan" kind="bar" data={planChart} series={[{ key: "Subscribers", name: "Subscribers", color: CHART_COLORS.amber }]} format={compact} /> : <EmptyState title="No subscribers yet" sub="Plans will appear here once people subscribe." />}
          </Slot>
        </Panel>
        <Panel>
          <PanelHeader title="Subscription movement" sub="In the chosen period" />
          <Slot query={subs} what="Subscriptions">
            <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
              {[
                ["New subscriptions", subs.data?.newInPeriod],
                ["Cancellations", subs.data?.churnInPeriod],
                ["On a trial", subs.data?.trialingCount],
                ["Payment overdue", subs.data?.pastDueCount],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-xl font-bold">{Number(v ?? 0).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </Slot>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Top content" sub="Most started in this period" />
          <Slot query={top} what="Top content">
            {!top.data?.length ? (
              <div className="p-5">
                <EmptyState title="Nothing played yet" sub={show("Movie") || show("eBook") || show("Audiobook") ? "Titles will rank here once people start watching, reading or listening." : ""} />
              </div>
            ) : (
              top.data.map((r, i) => (
                <div key={r.contentId} className="flex items-center gap-4 border-b border-border px-5 py-3 last:border-0">
                  <span className="w-6 text-xs font-bold text-muted-foreground">0{i + 1}</span>
                  <span className="flex-1 truncate text-sm font-semibold">{r.title}</span>
                  <Tag>{r.contentType}</Tag>
                  <strong className="w-16 text-right text-sm">{r.count.toLocaleString()}</strong>
                </div>
              ))
            )}
          </Slot>
        </Panel>
        <Panel>
          <PanelHeader title="Top genres" sub="By starts" />
          <Slot query={genres} what="Top genres">
            {!genres.data?.length ? (
              <div className="p-5">
                <EmptyState title="No genre data" sub="Genres will rank here once people start watching, reading or listening." />
              </div>
            ) : (
              <div className="space-y-4 p-5">
                {genres.data.slice(0, 5).map((g) => {
                  const pct = Math.max(1, Math.round((g.starts / genreTotal) * 100));
                  return (
                    <div key={g.genre}>
                      <div className="mb-1.5 flex justify-between text-sm">
                        <b>{g.genre}</b>
                        <span className="text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Slot>
        </Panel>
      </div>
    </>
  );
}
