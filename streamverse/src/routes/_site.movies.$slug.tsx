import { createFileRoute, Link } from "@tanstack/react-router";
import { Film, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Gated, PreviewBanner } from "@/components/sv/Gate";
import { MediaRow, MovieCard, MovieMeta } from "@/components/sv/media";
import { DownloadButton } from "@/components/sv/DownloadButton";
import { MyListButton } from "@/components/sv/SaveButtons";
import { ContentUnavailable, GeneralError } from "@/components/sv/states";
import { EmptyState, TabBar, Tag } from "@/components/sv/ui";
import { useApiMovieQuery, useCachedCard } from "@/hooks/useApiCatalog";
import { DetailSkeleton } from "@/components/sv/DetailSkeleton";
import { DEMO_MODE } from "@/lib/config";
import { findMovie, type Movie } from "@/lib/data";
import { itemEntity, toItem, useCatalog } from "@/lib/items";
import { apiMovieToLocal, mixedCardToItem } from "@/lib/api-mappers";
import { relatedTo } from "@/lib/related";
import { useProgressOf } from "@/lib/user";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "cast", label: "Cast" },
  { id: "trailers", label: "Trailers" },
  { id: "more", label: "More Like This" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_site/movies/$slug")({
  head: ({ params }) => {
    const loaderData = findMovie(params.slug);
    return loaderData
      ? {
          meta: [
            { title: `${loaderData.title} — Watch on StreamVerse` },
            { name: "description", content: loaderData.description },
            { property: "og:title", content: `${loaderData.title} — StreamVerse` },
            { property: "og:description", content: loaderData.description },
          ],
        }
      : { meta: [{ title: "Movie — StreamVerse" }] };
  },
  component: MovieDetailPage,
});

function MovieDetailPage() {
  const { slug } = Route.useParams();
  const cat = useCatalog();
  const apiQuery = useApiMovieQuery(slug);
  const peek = useCachedCard(slug);

  if (!DEMO_MODE && apiQuery.isLoading) return <DetailSkeleton peek={peek} />;
  if (!DEMO_MODE && apiQuery.isError) return <GeneralError />;

  const m: Movie | undefined = DEMO_MODE
    ? cat.movies.find((x) => x.slug === slug)
    : apiQuery.data
      ? apiMovieToLocal(apiQuery.data)
      : undefined;

  if (!DEMO_MODE && !m) return <ContentUnavailable />;

  // live mode: the server's list of real titles (the local catalog only holds demo titles)
  const related = DEMO_MODE
    ? m
      ? relatedTo(toItem("Movie", m), cat.listed, 12).map((i) => itemEntity(i) as Movie)
      : []
    : (apiQuery.data?.related ?? []).map((c) => itemEntity(mixedCardToItem(c)) as Movie);

  return (
    <>
      <PreviewBanner status={apiQuery.data?.previewStatus} />
      <Gated item={m ? toItem("Movie", m) : undefined}>{m && <MovieDetail m={m} related={related} />}</Gated>
    </>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{children || "-"}</dd>
    </div>
  );
}

function MovieDetail({ m, related }: { m: Movie; related: Movie[] }) {
  const [tab, setTab] = useState<TabId>("overview");
  const progress = useProgressOf({ type: "Movie", slug: m.slug });
  const info = m.info ?? {};
  const warnings = m.restrictions?.warnings ?? [];
  const resuming = !!progress && !progress.completed && progress.pct > 0;
  // live mode: only what the admin really added is offered (behind-the-scenes has no upload slot, so it is demo-only)
  const allTrailers: { id: "official" | "teaser" | "bts"; label: string }[] = [
    { id: "official", label: "Official Trailer" },
    { id: "teaser", label: "Teaser" },
    { id: "bts", label: "Behind the Scenes" },
  ];
  const trailers = DEMO_MODE ? allTrailers : allTrailers.filter((t) => (t.id === "official" ? m.hasTrailer : t.id === "teaser" ? m.hasTeaser : false));
  const tabs = DEMO_MODE || trailers.length > 0 ? [...TABS] : TABS.filter((x) => x.id !== "trailers");

  return (
    <>
      <section className="relative h-[60vh] min-h-[380px] overflow-hidden sm:h-[70vh] sm:min-h-[480px]">
        <img src={m.image} alt={m.title} className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-hero-x" />
        <div className="absolute inset-0 bg-hero-y" />
        <div className="relative mx-auto flex h-full max-w-[1600px] items-end px-4 pb-14 md:px-8">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl md:text-6xl">{m.title}</h1>
            <MovieMeta m={m} className="mt-4" />
            <p className="mt-4 line-clamp-3 text-soft md:line-clamp-none">{m.description}</p>
            {resuming && (
              <div className="mt-4 flex max-w-xs items-center gap-3 text-xs text-soft">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/20">
                  <div className="h-full bg-primary" style={{ width: `${progress.pct}%` }} />
                </div>
                {Math.round(progress.pct)}% watched
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/watch/$slug" params={{ slug: m.slug }} className="inline-flex h-12 items-center gap-2 rounded-md bg-primary px-6 text-sm font-bold tracking-wide text-primary-foreground uppercase shadow-red transition-colors hover:bg-primary-hover [&_svg]:size-4">
                <Play className="fill-current" /> {resuming ? "Resume" : "Play"}
              </Link>
              <MyListButton item={{ type: "Movie", slug: m.slug, ...(m.cid ? { id: m.cid } : {}) }} />
              <DownloadButton item={{ type: "Movie", slug: m.slug, ...(m.cid ? { id: m.cid } : {}) }} />
              {(DEMO_MODE || m.hasTrailer) && (
                <Link
                  to="/watch/$slug"
                  params={{ slug: m.slug }}
                  search={{ trailer: "official" }}
                  className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-foreground/15 px-6 text-sm font-bold tracking-wide uppercase backdrop-blur transition-colors hover:bg-foreground/25 [&_svg]:size-4"
                >
                  <Film /> Trailer
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 md:px-8">
        <TabBar tabs={tabs} value={tab} onChange={setTab} label="Movie sections" />
        <div className="py-8">
          {tab === "overview" && (
            <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="text-soft">{m.description}</p>
                {(info.tags?.length ?? 0) > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {info.tags!.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                )}
                {warnings.length > 0 && (
                  <div className="mt-6 rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-warning">
                      <ShieldAlert className="size-4" /> Content warnings
                    </div>
                    <p className="mt-1 text-sm text-soft">{warnings.join(" · ")}</p>
                  </div>
                )}
              </div>
              <dl className="divide-y divide-border rounded-xl border border-border bg-surface px-5">
                <Fact k="Director">{info.director ?? m.cast[1]?.name}</Fact>
                <Fact k="Producer">{info.producer}</Fact>
                <Fact k="Language">{info.language ?? "English"}</Fact>
                <Fact k="Available audio">{(info.audio ?? ["English"]).join(", ")}</Fact>
                <Fact k="Subtitles">{(info.subtitles ?? ["English"]).join(", ")}</Fact>
                <Fact k="Age rating">{m.rating}</Fact>
                <Fact k="Released">{m.year}</Fact>
                <Fact k="Runtime">{m.runtime}</Fact>
                <Fact k="Genres">{m.genres.join(", ")}</Fact>
              </dl>
            </div>
          )}
          {tab === "cast" &&
            (m.cast.length === 0 ? (
              <EmptyState icon={Film} title="Cast not listed" sub="The cast for this title hasn't been added yet." />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {m.cast.map((c) => (
                  <div key={c.name + c.role} className="rounded-lg border border-border bg-surface p-4 text-center">
                    <div className="mx-auto grid size-16 place-items-center rounded-full bg-red-grad text-lg font-bold">
                      {c.name
                        .split(" ")
                        .map((x) => x[0])
                        .join("")}
                    </div>
                    <div className="mt-3 text-sm font-semibold">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.role}</div>
                  </div>
                ))}
              </div>
            ))}
          {tab === "trailers" && (
            <div className="grid gap-4 md:grid-cols-3">
              {trailers.map((t) => (
                <Link key={t.id} to="/watch/$slug" params={{ slug: m.slug }} search={{ trailer: t.id }} className="group text-left">
                  <div className="relative aspect-video overflow-hidden rounded-lg border border-border">
                    <img src={m.image} alt="" className="size-full object-cover opacity-70 transition-opacity group-hover:opacity-100" />
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid size-12 place-items-center rounded-full bg-primary">
                        <Play className="size-5 fill-current" />
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold">{t.label}</div>
                </Link>
              ))}
            </div>
          )}
          {tab === "more" &&
            (related.length === 0 ? (
              <EmptyState icon={Film} title="Nothing similar yet" sub="More titles like this will appear as the catalog grows." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {related.map((r) => (
                  <MovieCard key={r.slug} m={r} wide={false} />
                ))}
              </div>
            ))}
        </div>
      </div>
      <div className="space-y-10 pt-4">
        <MediaRow title="You May Also Like" seeAll="/movies" empty={related.length === 0}>
          {related.map((r) => (
              <MovieCard key={r.slug} m={r} />
            ))}
        </MediaRow>
      </div>
    </>
  );
}
