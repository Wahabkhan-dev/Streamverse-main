import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, CreditCard, Download, Film, Headphones, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SelectBox } from "@/components/sv/admin";
import { CHART_COLORS, Chart } from "@/components/sv/charts";
import { Btn, EmptyState, MetricCard, PageHeader, Panel, PanelHeader, Skel, Tag } from "@/components/sv/ui";
import { DEFAULT_FILTERS, PLATFORM_USERS, RANGES, buildSeries, compact, genreFactor, lastOf, planTotals, sumOf, trendOf, usd, type AnalyticsFilters, type PeriodId, type RangeId, type TypeId } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import { fmt } from "@/lib/data";
import { useAudiobooks, useEbooks, useGenres, useMovies, usePlans } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { LiveAnalytics } from "@/components/sv/LiveAnalytics";

export const Route = createFileRoute("/admin/analytics")({ component: () => (DEMO_MODE ? <DemoAnalytics /> : <LiveAnalytics />) });

const TYPES: TypeId[] = ["All", "Movies", "eBooks", "Audiobooks"];
const PERIODS: PeriodId[] = ["Daily", "Weekly", "Monthly"];

/** Demo mode only: sample data that reacts to the filters. */
function DemoAnalytics() {
  const movies = useMovies();
  const ebooks = useEbooks();
  const audiobooks = useAudiobooks();
  const genres = useGenres();
  const totals = planTotals(usePlans());

  const [f, setF] = useState<AnalyticsFilters>(DEFAULT_FILTERS);
  const set = <K extends keyof AnalyticsFilters>(k: K, v: AnalyticsFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const days = RANGES.find((r) => r.id === f.range)!.days;
  const show = (t: Exclude<TypeId, "All">) => f.type === "All" || f.type === t;

  const data = useMemo(() => {
    const k = genreFactor(f.genre, movies, [...ebooks, ...audiobooks]);
    return {
      users: buildSeries(f, [{ key: "Users", end: PLATFORM_USERS, growth: 0.18, cumulative: true }], k),
      subs: buildSeries(f, [{ key: "Subscriptions", end: totals.subs, growth: 0.14, cumulative: true }], k),
      revenue: buildSeries(f, [{ key: "Revenue", end: totals.revenue, growth: 0.1, cumulative: false }], k),
      movies: buildSeries(f, [{ key: "Views", end: 1_840_000, growth: 0.2, cumulative: false }], show("Movies") ? k : 0),
      books: buildSeries(f, [{ key: "Reads", end: 642_000, growth: 0.16, cumulative: false }], show("eBooks") ? k : 0),
      audio: buildSeries(f, [{ key: "Listens", end: 428_000, growth: 0.24, cumulative: false }], show("Audiobooks") ? k : 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, movies, ebooks, audiobooks, totals.subs, totals.revenue]);

  // ranked titles and genre shares come from the real catalog, scaled to the chosen range
  const scale = days / 30;
  const ranked = useMemo(() => {
    const rows = [
      ...(show("Movies") ? movies.map((m) => ({ title: m.title, type: "Movie", genre: m.genres, n: m.views })) : []),
      ...(show("eBooks") ? ebooks.map((b) => ({ title: b.title, type: "eBook", genre: [b.genre], n: b.count })) : []),
      ...(show("Audiobooks") ? audiobooks.map((b) => ({ title: b.title, type: "Audiobook", genre: [b.genre], n: b.count })) : []),
    ].filter((r) => f.genre === "All" || r.genre.includes(f.genre));
    return rows.sort((a, b) => b.n - a.n).slice(0, 5).map((r) => ({ ...r, n: Math.round(r.n * Math.min(1, scale)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, movies, ebooks, audiobooks]);
  const genreShare = useMemo(() => {
    const tally = new Map<string, number>();
    const add = (g: string, n: number) => tally.set(g, (tally.get(g) ?? 0) + n);
    if (show("Movies")) movies.forEach((m) => m.genres.forEach((g) => add(g, m.views / m.genres.length)));
    if (show("eBooks")) ebooks.forEach((b) => add(b.genre, b.count));
    if (show("Audiobooks")) audiobooks.forEach((b) => add(b.genre, b.count));
    const total = [...tally.values()].reduce((a, n) => a + n, 0) || 1;
    return [...tally.entries()]
      .filter(([g]) => f.genre === "All" || g === f.genre)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g, n]) => ({ g, pct: Math.max(1, Math.round((n / total) * 100)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, movies, ebooks, audiobooks]);

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Period", "Users", "Subscriptions", "Revenue", "Movie views", "Book reads", "Audiobook listens"]];
    data.users.forEach((p, i) => rows.push([String(p.label), Number(p["Users"]), Number(data.subs[i]!["Subscriptions"]), Number(data.revenue[i]!["Revenue"]), Number(data.movies[i]!["Views"]), Number(data.books[i]!["Reads"]), Number(data.audio[i]!["Listens"])]));
    if (downloadCsv(`streamverse-analytics-${f.range}.csv`, rows)) toast.success("Analytics exported");
    else toast.error("Your browser blocked the download.");
  };

  const chart = (title: string, sub: string, el: React.ReactNode, off = false) => (
    <Panel>
      <PanelHeader title={title} sub={off ? "Hidden by the Content Type filter" : sub} />
      {off ? <EmptyState title="Not included" sub={`Switch Content Type to include ${title.toLowerCase()}.`} /> : el}
    </Panel>
  );

  return (
    <>
      <PageHeader
        title="Analytics"
        sub="The shape of what people are watching, reading and listening to. Sample data that reacts to your filters."
        actions={
          <Btn onClick={exportCsv}>
            <Download /> Export CSV
          </Btn>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4 lg:grid-cols-4">
        {(
          [
            ["Date Range", RANGES.find((r) => r.id === f.range)!.label, RANGES.map((r) => r.label), (v: string) => set("range", RANGES.find((r) => r.label === v)!.id as RangeId)],
            ["Content Type", f.type, TYPES, (v: string) => set("type", v as TypeId)],
            ["Genre", f.genre, ["All", ...genres.map((g) => g.name)], (v: string) => set("genre", v)],
            ["Time Period", f.period, PERIODS, (v: string) => set("period", v as PeriodId)],
          ] as const
        ).map(([label, value, options, onChange]) => (
          <label key={label} className="block min-w-0">
            <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</span>
            <SelectBox value={value} onChange={onChange} options={[...options]} aria-label={label} />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard icon={Users} label="Users" value={compact(lastOf(data.users, "Users"))} trend={trendOf(data.users, "Users")} />
        <MetricCard icon={CreditCard} label="Subscriptions" value={compact(lastOf(data.subs, "Subscriptions"))} trend={trendOf(data.subs, "Subscriptions")} />
        <MetricCard icon={Film} label="Movie views" value={compact(sumOf(data.movies, "Views"))} trend={trendOf(data.movies, "Views")} />
        <MetricCard icon={BookOpen} label="Book reads" value={compact(sumOf(data.books, "Reads"))} trend={trendOf(data.books, "Reads")} />
        <MetricCard icon={Headphones} label="Audiobook listens" value={compact(sumOf(data.audio, "Listens"))} trend={trendOf(data.audio, "Listens")} />
        <MetricCard icon={TrendingUp} label="Revenue" value={usd(sumOf(data.revenue, "Revenue"))} trend={trendOf(data.revenue, "Revenue")} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {chart("User Growth", "Registered users over time", <Chart label="User growth" data={data.users} series={[{ key: "Users", name: "Users", color: CHART_COLORS.red }]} format={compact} />)}
        {chart("Subscription Growth", "Active subscriptions over time", <Chart label="Subscription growth" data={data.subs} series={[{ key: "Subscriptions", name: "Subscriptions", color: CHART_COLORS.green }]} format={compact} />)}
        {chart("Revenue", "Revenue per period (USD)", <Chart label="Revenue" kind="bar" data={data.revenue} series={[{ key: "Revenue", name: "Revenue", color: CHART_COLORS.red }]} format={usd} />)}
        {chart("Movie Views", "Plays per period", <Chart label="Movie views" kind="line" data={data.movies} series={[{ key: "Views", name: "Views", color: CHART_COLORS.red }]} format={compact} />, !show("Movies"))}
        {chart("Book Reads", "Reading sessions per period", <Chart label="Book reads" kind="line" data={data.books} series={[{ key: "Reads", name: "Reads", color: CHART_COLORS.amber }]} format={compact} />, !show("eBooks"))}
        {chart("Audiobook Listens", "Listening sessions per period", <Chart label="Audiobook listens" kind="line" data={data.audio} series={[{ key: "Listens", name: "Listens", color: CHART_COLORS.blue }]} format={compact} />, !show("Audiobooks"))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Top content" sub="Engagement across the platform" />
          {ranked.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No titles match" sub="Try another genre or content type." />
            </div>
          ) : (
            ranked.map((r, i) => (
              <div key={r.title} className="flex items-center gap-4 border-b border-border px-5 py-3 last:border-0">
                <span className="w-6 text-xs font-bold text-muted-foreground">0{i + 1}</span>
                <span className="flex-1 truncate text-sm font-semibold">{r.title}</span>
                <Tag>{r.type}</Tag>
                <strong className="w-16 text-right text-sm">{fmt(r.n)}</strong>
              </div>
            ))
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Top genres" sub="By total engagement" />
          {genreShare.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No genre data" sub="Try another content type." />
            </div>
          ) : (
            <div className="space-y-4 p-5">
              {genreShare.map((g) => (
                <div key={g.g}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <b>{g.g}</b>
                    <span className="text-muted-foreground">{g.pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${g.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
