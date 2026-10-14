import { Link } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, BookOpen, Bookmark, Clock, Download, Eye, Film, Headphones, ListPlus, Pencil, Star, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RANGES, compact, titleStats, type RangeId, type Share } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import type { Book, Movie } from "@/lib/data";
import { movieRating } from "@/lib/items";
import { chaptersOf } from "@/lib/book-content";
import { useAudiobooks, useEbooks, useMovies } from "@/lib/store";
import { SelectBox } from "./admin";
import { CHART_COLORS, Chart } from "./charts";
import { Btn, EmptyState, PageHeader, Panel, PanelHeader, StatusBadge } from "./ui";

type Kind = "Movie" | "eBook" | "Audiobook";
const base = { Movie: "movies", eBook: "ebooks", Audiobook: "audiobooks" } as const;
const verb = { Movie: "Views", eBook: "Reads", Audiobook: "Listens" } as const;

function Kpi({ icon: Icon, label, value, note }: { icon: React.ElementType; label: string; value: string; note?: string }) {
  return (
    <Panel className="p-4">
      <span className="grid size-9 place-items-center rounded-md bg-primary/12 text-primary-text">
        <Icon className="size-4" />
      </span>
      <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {note && <div className="mt-0.5 text-[11px] text-soft">{note}</div>}
    </Panel>
  );
}

function Bars({ title, sub, data }: { title: string; sub: string; data: Share[] }) {
  return (
    <Panel>
      <PanelHeader title={title} sub={sub} />
      <div className="space-y-3.5 p-5">
        {data.map((d) => (
          <div key={d.label}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{d.label}</span>
              <span className="text-muted-foreground">{d.pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={d.label} aria-valuenow={d.pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${d.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Audience statistics for one title: how many people, how far they get, where they are, and what they use. */
export function TitleStats({ type, slug }: { type: Kind; slug: string }) {
  const movies = useMovies();
  const ebooks = useEbooks();
  const audiobooks = useAudiobooks();
  const [range, setRange] = useState<RangeId>("30d");
  const item: Movie | Book | undefined = (type === "Movie" ? movies : type === "eBook" ? ebooks : audiobooks).find((x) => x.slug === slug);

  const stats = useMemo(() => {
    if (!item) return null;
    const total = type === "Movie" ? (item as Movie).views : (item as Book).count;
    const rating = type === "Movie" ? movieRating(item as Movie) : (item as Book).rating;
    const reviews = type === "Movie" ? Math.round((item as Movie).views / 900) : (item as Book).reviews;
    return titleStats(type, slug, total, range, { rating, reviews, chapters: type === "Movie" ? 0 : chaptersOf(item as Book).length });
  }, [item, type, slug, range]);

  const back = (
    <Link to={`/admin/${base[type]}` as "/admin/movies"} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" /> Back to {type === "Movie" ? "Movies" : type === "eBook" ? "eBooks" : "Audiobooks"}
    </Link>
  );
  if (!item || !stats) {
    return (
      <>
        {back}
        <EmptyState icon={BarChart3} title={`${type} not found`} sub="It may have been deleted." />
      </>
    );
  }
  const Icon = type === "Movie" ? Film : type === "eBook" ? BookOpen : Headphones;
  const live = item.status === "Published" || item.status === "Archived" || item.status === "Unpublished";
  const label = verb[type];

  return (
    <>
      {back}
      <PageHeader
        eyebrow={`StreamVerse / ${type} stats`}
        title={item.title}
        sub={`Audience statistics for this ${type === "Movie" ? "movie" : type === "eBook" ? "eBook" : "audiobook"}.`}
        actions={
          <>
            <StatusBadge status={item.status} />
            <Link to={`/${base[type]}/$slug` as "/movies/$slug"} params={{ slug }} className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3 [&_svg]:size-4">
              <Eye /> Preview
            </Link>
            <Link to={`/admin/${base[type]}/$slug/edit` as "/admin/movies/$slug/edit"} params={{ slug }} className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3 [&_svg]:size-4">
              <Pencil /> Edit
            </Link>
          </>
        }
      />
      {!live ? (
        <EmptyState icon={BarChart3} title="No statistics yet" sub={`Statistics appear once this title is published. It is currently ${item.status.toLowerCase()}.`} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="w-48">
              <SelectBox value={RANGES.find((r) => r.id === range)!.label} onChange={(v) => setRange(RANGES.find((r) => r.label === v)!.id)} options={RANGES.map((r) => r.label)} aria-label="Date range" />
            </div>
            <Btn
              onClick={() => {
                const ok = downloadCsv(`${slug}-stats.csv`, [["Period", label], ...stats.series.map((p) => [String(p.label), Number(p[label])])]);
                if (ok) toast.success("Statistics exported");
                else toast.error("Your browser blocked the download.");
              }}
            >
              <Download /> Export CSV
            </Btn>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
            <Kpi icon={Icon} label={`Total ${label.toLowerCase()}`} value={compact(stats.plays)} note={RANGES.find((r) => r.id === range)!.label} />
            <Kpi icon={Users} label="Unique audience" value={compact(stats.unique)} />
            <Kpi icon={BarChart3} label="Completion rate" value={`${stats.completionPct}%`} note="Reached the end" />
            <Kpi icon={Clock} label={type === "eBook" ? "Avg reading time" : type === "Movie" ? "Avg watch time" : "Avg listening time"} value={`${Math.floor(stats.avgMinutes / 60)}h ${String(stats.avgMinutes % 60).padStart(2, "0")}m`} />
            <Kpi icon={Star} label="Average rating" value={stats.rating > 0 ? stats.rating.toFixed(1) : "-"} note={`${stats.reviews.toLocaleString()} reviews`} />
            <Kpi icon={ListPlus} label="Saves" value={compact(stats.listAdds + stats.libraryAdds)} note={`${compact(stats.listAdds)} My List · ${compact(stats.libraryAdds)} Library`} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Panel>
              <PanelHeader title={`${label} over time`} sub={RANGES.find((r) => r.id === range)!.label} />
              <Chart label={`${label} over time`} data={stats.series} series={[{ key: label, name: label, color: CHART_COLORS.red }]} format={compact} />
            </Panel>
            <Panel>
              <PanelHeader title="How far people get" sub="Audience reaching each point" />
              <Chart label="Audience retention" kind="bar" data={stats.funnel} series={[{ key: "People", name: "People", color: CHART_COLORS.amber }]} format={compact} />
            </Panel>
            {stats.extra
              .filter((e) => e.kind === "chart")
              .map((e) => (
                <Panel key={e.title} className="xl:col-span-2">
                  <PanelHeader title={e.title} sub={e.sub} />
                  <Chart label={e.title} kind="bar" height={220} data={e.chart ?? []} series={[{ key: Object.keys(e.chart?.[0] ?? {}).find((k) => k !== "label") ?? "Value", name: "People", color: CHART_COLORS.blue }]} format={compact} />
                </Panel>
              ))}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <Bars title="Top countries" sub="Where the audience is" data={stats.countries} />
            <Bars title="Plans" sub="Audience by subscription" data={stats.plans} />
            <Bars title="Devices" sub="How people watch, read or listen" data={stats.devices} />
            {stats.extra
              .filter((e) => e.kind === "bars")
              .map((e) => (
                <Bars key={e.title} title={e.title} sub={e.sub} data={e.data} />
              ))}
          </div>
          <p className="mt-6 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Bookmark className="size-3.5" /> Sample statistics: they scale with this title's real {label.toLowerCase()} count. Real audience data arrives with the backend.
          </p>
        </>
      )}
    </>
  );
}
