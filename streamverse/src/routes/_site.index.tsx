import { createFileRoute } from "@tanstack/react-router";
import { Film } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { resolveBanners } from "@/lib/banners";
import {
  LatestReleaseBanner,
  NormalBanner,
  PromotionalBanner,
  activeBanners,
} from "@/components/sv/Banners";
import { ItemCard } from "@/components/sv/ItemCard";
import {
  CollectionCard,
  HeroBanner,
  MediaRow,
  ProgressCard,
  useFakeLoad,
  type HeroSlide,
  type SeeAllPath,
} from "@/components/sv/media";
import { EmptyState, Skel } from "@/components/sv/ui";
import type { Book, Movie } from "@/lib/data";
import { buildCatalog, isListed, useCatalog, type Item } from "@/lib/items";
import { detailTarget, linkFor } from "@/lib/links";
import { runtimeSeconds, timeLeft } from "@/lib/runtime";
import {
  useBanners,
  useCollections,
  useHomepage,
  useSettings,
  type Banner,
  type BannerType,
  type Collection,
  type HomeAutoFlag,
  type HomeSection,
  type HomeSectionId,
  type LinkKind,
} from "@/lib/store";
import { usePrefs, useProgressMap } from "@/lib/user";
import { DEMO_MODE } from "@/lib/config";
import { useApiMoviesQuery, useApiEbooksQuery, useApiAudiobooksQuery, useApiHomepageQuery, useApiBannersQuery, useApiCollectionsQuery } from "@/hooks/useApiCatalog";
import type { ApiBanner, ApiHomeSection, ApiCollection } from "@/api/types";
import { apiMovieToLocal, apiBookToLocal } from "@/lib/api-mappers";

export const Route = createFileRoute("/_site/")({
  head: () => ({
    meta: [
      { title: "StreamVerse — Movies, eBooks & Audiobooks" },
      {
        name: "description",
        content:
          "Stream cinematic movies, read eBooks and listen to audiobooks on one premium platform.",
      },
      { property: "og:title", content: "StreamVerse — Movies, eBooks & Audiobooks" },
      {
        property: "og:description",
        content: "Stream movies, read eBooks and listen to audiobooks on one premium platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

// ── API → local type mappers ─────────────────────────────────────────────────

function apiBannerToLocal(b: ApiBanner): Banner {
  return {
    id: b.id,
    type: b.type as BannerType,
    title: b.title,
    description: b.description,
    buttonText: b.buttonText,
    linkKind: b.linkKind as LinkKind,
    ...(b.linkId !== undefined ? { linkId: b.linkId } : {}),
    linkSlug: b.linkSlug ?? "",
    image: b.image,
    mobileImage: b.mobileImage,
    priority: b.priority,
    start: b.start,
    end: b.end,
    active: b.active,
  };
}

function apiSectionToLocal(s: ApiHomeSection): HomeSection {
  return {
    id: s.id as HomeSectionId,
    title: s.title,
    enabled: s.enabled,
    limit: s.limit,
    mode: s.mode,
    ...(s.autoFlag !== undefined ? { autoFlag: s.autoFlag as HomeAutoFlag } : {}),
    items: s.items.map((item) => ({
      type: item.contentType === "movie" ? "Movie" : item.contentType === "ebook" ? "eBook" : "Audiobook",
      slug: item.movie?.slug ?? item.ebook?.slug ?? item.audiobook?.slug ?? "",
      id: item.contentId,
    })),
  };
}

function apiCollectionToLocal(c: ApiCollection): Collection {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    cover: c.cover ?? "",
    status: c.status,
    items: c.items.map((item) => ({
      type: item.contentType === "movie" ? "Movie" : item.contentType === "ebook" ? "eBook" : "Audiobook",
      slug: item.movie?.slug ?? item.ebook?.slug ?? item.audiobook?.slug ?? "",
      id: item.contentId,
    })),
  };
}

// ── Rendering helpers (unchanged) ────────────────────────────────────────────

/** Titles the admin flagged come first; the rest follow in a sensible order. */
function flaggedFirst<T extends Movie | Book>(
  list: T[],
  flag: "featured" | "trending" | "popular" | "newRelease",
  rest: (a: T, b: T) => number,
): T[] {
  return [...list].sort(
    (a, b) => Number(!!b.promo?.[flag]) - Number(!!a.promo?.[flag]) || rest(a, b),
  );
}
const byViews = (a: Movie, b: Movie) => b.views - a.views;
const byYear = (a: Movie | Book, b: Movie | Book) => b.year - a.year;
const seeAllOf: Partial<Record<HomeSectionId, SeeAllPath>> = {
  continue: "/my-library",
  trending_movies: "/movies",
  popular_movies: "/movies",
  latest_movies: "/movies",
  featured_ebooks: "/ebooks",
  new_ebooks: "/ebooks",
  featured_audiobooks: "/audiobooks",
  new_audiobooks: "/audiobooks",
  collections: "/collections",
};

function Home() {
  // ── Demo-mode data (always call hooks) ────────────────────────────────
  const demoCat = useCatalog();
  const demoSections = useHomepage();
  const demoRawBanners = useBanners();
  const demoCollections = useCollections();

  // ── API-mode data (enabled: !DEMO_MODE internally) ────────────────────
  const apiMoviesQuery = useApiMoviesQuery({ page: 1, limit: 100 });
  const apiEbooksQuery = useApiEbooksQuery({ page: 1, limit: 100 });
  const apiAudiobooksQuery = useApiAudiobooksQuery({ page: 1, limit: 100 });
  const apiHomepageQuery = useApiHomepageQuery();
  const apiBannersQuery = useApiBannersQuery();
  const apiCollectionsQuery = useApiCollectionsQuery();

  // ── User data (always local) ──────────────────────────────────────────
  const progress = useProgressMap();
  const settings = useSettings();
  const prefs = usePrefs();
  const loading = useFakeLoad(450);

  // ── Build unified data (all useMemo before any early returns) ─────────
  const cat = useMemo(() => {
    if (DEMO_MODE) return demoCat;
    const apiMovies = (apiMoviesQuery.data?.data ?? []).map(apiMovieToLocal);
    const apiEbooks = (apiEbooksQuery.data?.data ?? []).map(apiBookToLocal);
    const apiAudiobooks = (apiAudiobooksQuery.data?.data ?? []).map(apiBookToLocal);
    return buildCatalog(apiMovies, apiEbooks, apiAudiobooks);
  }, [DEMO_MODE, demoCat, apiMoviesQuery.data, apiEbooksQuery.data, apiAudiobooksQuery.data]);

  const sections = useMemo(() => {
    if (DEMO_MODE) return demoSections;
    return (apiHomepageQuery.data ?? []).map(apiSectionToLocal);
  }, [DEMO_MODE, demoSections, apiHomepageQuery.data]);

  const rawBanners = useMemo(() => {
    if (DEMO_MODE) return demoRawBanners;
    return (apiBannersQuery.data ?? []).map(apiBannerToLocal);
  }, [DEMO_MODE, demoRawBanners, apiBannersQuery.data]);

  const collections = useMemo(() => {
    if (DEMO_MODE) return demoCollections;
    return (apiCollectionsQuery.data ?? []).map(apiCollectionToLocal);
  }, [DEMO_MODE, demoCollections, apiCollectionsQuery.data]);

  const banners = useMemo(
    () => resolveBanners(rawBanners, cat.all, collections),
    [rawBanners, cat.all, collections],
  );

  const rows = useMemo(() => {
    const manual = (s: HomeSection) => cat.resolveListed(s.items).slice(0, s.limit);
    const auto = (s: HomeSection, items: Item[]) =>
      s.mode === "manual" ? manual(s) : items.slice(0, s.limit);
    const asMovies = (m: Movie[]): Item[] => m.map((x) => ({ type: "Movie", slug: x.slug, m: x }));
    const asBooks = (b: Book[], type: "eBook" | "Audiobook"): Item[] =>
      b.map((x) => ({ type, slug: x.slug, b: x }));
    const out: Partial<Record<HomeSectionId, Item[]>> = {};
    for (const s of sections) {
      switch (s.id) {
        case "trending_movies":
          out[s.id] = auto(s, asMovies(flaggedFirst(cat.listedMovies, "trending", byViews)));
          break;
        case "popular_movies":
          out[s.id] = auto(s, asMovies(flaggedFirst(cat.listedMovies, "popular", byViews)));
          break;
        case "latest_movies":
          out[s.id] = auto(s, asMovies(flaggedFirst(cat.listedMovies, "newRelease", byYear)));
          break;
        case "featured_ebooks":
          out[s.id] = auto(
            s,
            asBooks(
              flaggedFirst(cat.listedEbooks, "featured", () => 0),
              "eBook",
            ),
          );
          break;
        case "new_ebooks":
          out[s.id] = auto(
            s,
            asBooks(flaggedFirst(cat.listedEbooks, "newRelease", byYear), "eBook"),
          );
          break;
        case "featured_audiobooks":
          out[s.id] = auto(
            s,
            asBooks(
              flaggedFirst(cat.listedAudiobooks, "featured", () => 0),
              "Audiobook",
            ),
          );
          break;
        case "new_audiobooks":
          out[s.id] = auto(
            s,
            asBooks(flaggedFirst(cat.listedAudiobooks, "newRelease", byYear), "Audiobook"),
          );
          break;
      }
    }
    return out;
  }, [cat, sections]);

  // Continue Watching comes from the customer's own movie progress
  const continuing = useMemo(
    () =>
      Object.values(progress)
        .filter((p) => p.type === "Movie" && !p.completed && p.pct > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((p) => ({ p, m: cat.movies.find((m) => m.slug === p.slug) }))
        .filter((x): x is { p: typeof x.p; m: Movie } => !!x.m && isListed(x.m)),
    [progress, cat.movies],
  );

  const heroSlides = useMemo<HeroSlide[]>(() => {
    const s = sections.find((x) => x.id === "hero");
    if (!s) return [];
    const fromMovie = (m: Movie): HeroSlide => ({
      key: `m-${m.slug}`,
      image: m.image,
      title: m.title,
      description: m.description,
      buttonText: "Watch Now",
      movie: m,
      target: detailTarget("Movie", m.slug),
      infoTarget: detailTarget("Movie", m.slug),
    });
    if (s.mode === "manual") {
      const picked = cat
        .resolveListed(s.items)
        .filter((i): i is Extract<Item, { type: "Movie" }> => i.type === "Movie");
      if (picked.length) return picked.slice(0, s.limit).map((i) => fromMovie(i.m));
      // Manual with no items: fall through to banners then auto
      const fromBanners = activeBanners(banners, "Hero Banner")
        .slice(0, s.limit)
        .map<HeroSlide>((b) => {
          const movie =
            b.linkKind === "movie" ? cat.movies.find((m) => m.slug === b.linkSlug) : undefined;
          const t = linkFor(b.linkKind, b.linkSlug);
          return {
            key: b.id,
            image: b.image,
            mobileImage: b.mobileImage,
            title: b.title,
            description: b.description,
            buttonText: b.buttonText || "Watch Now",
            ...(movie ? { movie } : {}),
            ...(t ? { target: t } : {}),
            ...(movie ? { infoTarget: detailTarget("Movie", movie.slug) } : {}),
          };
        });
      if (fromBanners.length) return fromBanners;
    }
    // Auto mode
    const flag = s.autoFlag ?? "featured";
    const rest = flag === "newRelease" ? byYear : byViews;
    return flaggedFirst(cat.listedMovies, flag, rest).slice(0, s.limit).map(fromMovie);
  }, [sections, banners, cat]);

  const shownCollections = collections.filter((c) => c.status === "Published");

  const body: ReactNode[] = [];
  const enabled = sections.filter((s) => s.enabled);
  let hero: ReactNode = null;
  for (const s of enabled) {
    const key = s.id;
    const see = seeAllOf[s.id];
    switch (s.id) {
      case "hero":
        hero = loading ? (
          <Skel className="h-[72vh] min-h-[460px] w-full rounded-none md:h-[78vh]" />
        ) : heroSlides.length ? (
          <HeroBanner
            slides={heroSlides}
            autoplay={settings.autoplayPreview && prefs.autoplayPreview}
          />
        ) : null;
        break;
      case "continue":
        body.push(
          <MediaRow
            key={key}
            title={s.title}
            {...(see ? { seeAll: see } : {})}
            loading={loading}
            empty={continuing.length === 0}
          >
            {continuing.slice(0, s.limit).map(({ p, m }) => (
              <ProgressCard
                key={m.slug}
                m={m}
                progress={p.pct}
                left={timeLeft(runtimeSeconds(m.runtime) * (1 - p.pct / 100))}
              />
            ))}
          </MediaRow>,
        );
        break;
      case "collections":
        body.push(
          <MediaRow
            key={key}
            title={s.title}
            {...(see ? { seeAll: see } : {})}
            loading={loading}
            empty={shownCollections.length === 0}
          >
            {shownCollections.slice(0, s.limit).map((c) => (
              <CollectionCard key={c.id} c={c} />
            ))}
          </MediaRow>,
        );
        break;
      default: {
        const items = rows[s.id] ?? [];
        const variant = s.id.includes("movies")
          ? "wide"
          : s.id.includes("audiobooks")
            ? "square"
            : "book";
        body.push(
          <MediaRow
            key={key}
            title={s.title}
            {...(see ? { seeAll: see } : {})}
            loading={loading}
            empty={items.length === 0}
            variant={variant}
          >
            {items.map((i) => (
              <ItemCard key={`${i.type}-${i.slug}`} item={i} />
            ))}
          </MediaRow>,
        );
      }
    }
  }

  // Promotional, Normal and Latest Release banners sit between rows
  if (!loading) {
    const promo = activeBanners(banners, "Promotional Banner")[0];
    const normal = activeBanners(banners, "Normal Banner")[0];
    const latest = activeBanners(banners, "Latest Release Banner")[0];
    const place = (at: number, node: ReactNode) => body.splice(Math.min(at, body.length), 0, node);
    if (latest) place(6, <LatestReleaseBanner key="latest-banner" banner={latest} />);
    if (normal) place(3, <NormalBanner key="normal-banner" banner={normal} />);
    if (promo) place(1, <PromotionalBanner key="promo-banner" banner={promo} />);
  }

  const nothing = !loading && !hero && body.length === 0;
  return (
    <>
      {hero}
      <div className={hero ? "relative z-10 -mt-16 space-y-10" : "space-y-10 pt-8"}>
        {nothing ? (
          <div className="px-4 md:px-8">
            <EmptyState
              icon={Film}
              title="Nothing to watch yet"
              sub="New titles are added all the time. Check back soon."
            />
          </div>
        ) : (
          body
        )}
        {loading && <span className="sr-only">Loading</span>}
      </div>
    </>
  );
}
