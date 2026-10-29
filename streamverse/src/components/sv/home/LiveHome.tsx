import { Film } from "lucide-react";
import { useMemo } from "react";
import type { ApiHomeBanner, ApiHomeSection, ApiMixedCard } from "@/api/types";
import { useApiHomepagePages } from "@/hooks/useApiCatalog";
import { apiBannerToLocal } from "@/lib/banner-mapper";
import { mixedCardToItem } from "@/lib/api-mappers";
import { detailTarget } from "@/lib/links";
import { LatestReleaseBanner, NormalBanner, PromotionalBanner } from "../Banners";
import { ItemCard } from "../ItemCard";
import { CollectionCard, HeroBanner, MediaRow, type HeroSlide, type SeeAllPath } from "../media";
import { EmptyState, Skel } from "../ui";
import { ContinueRow } from "./ContinueRow";

const SEE_ALL: Partial<Record<string, SeeAllPath>> = {
  MOVIE: "/movies",
  EBOOK: "/ebooks",
  AUDIOBOOK: "/audiobooks",
};

/** Skeleton shown in place of a section that has not loaded (or scrolled into view) yet; same height, so nothing jumps. */
function SectionSkeleton({ hero }: { hero?: boolean }) {
  if (hero) return <Skel className="h-[60vh] min-h-[360px] w-full rounded-none sm:h-[72vh]" />;
  return (
    <div className="px-4 md:px-8" aria-hidden>
      <Skel className="mb-3 h-6 w-48" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Skel key={i} className="aspect-video w-60 shrink-0" />
        ))}
      </div>
    </div>
  );
}

function heroSlides(items: ApiMixedCard[]): HeroSlide[] {
  const out: HeroSlide[] = [];
  for (const c of items) {
    if (c.type !== "MOVIE") continue;
    const it = mixedCardToItem(c);
    if (it.type !== "Movie") continue;
    out.push({
      key: `m-${c.slug}`,
      image: it.m.image,
      title: it.m.title,
      description: it.m.description,
      buttonText: "Watch Now",
      movie: it.m,
      target: detailTarget("Movie", c.slug),
      infoTarget: detailTarget("Movie", c.slug),
    });
  }
  return out;
}

function BannerSection({ banner }: { banner: ApiHomeBanner }) {
  const b = apiBannerToLocal({ ...banner, priority: 0 } as never);
  if (!b.image) return null;
  if (b.type === "Promotional Banner") return <PromotionalBanner banner={b} />;
  if (b.type === "Latest Release Banner") return <LatestReleaseBanner banner={b} />;
  if (b.type === "Hero Banner") {
    const slide: HeroSlide = {
      key: b.id,
      image: b.image,
      ...(b.mobileImage ? { mobileImage: b.mobileImage } : {}),
      title: b.title,
      description: b.description,
      buttonText: b.buttonText || "Learn more",
    };
    return <HeroBanner slides={[slide]} autoplay={false} />;
  }
  return <NormalBanner banner={b} />;
}

function ContentRow({ s }: { s: ApiHomeSection }) {
  const items = useMemo(
    () =>
      (s.items ?? [])
        .slice(0, s.itemLimit)
        .map((c) => mixedCardToItem(c as unknown as ApiMixedCard)),
    [s.items, s.itemLimit],
  );
  const only = new Set((s.items ?? []).map((c) => (c as unknown as ApiMixedCard).type));
  const kind = only.size === 1 ? [...only][0] : undefined;
  const variant =
    kind === "MOVIE"
      ? "wide"
      : kind === "AUDIOBOOK"
        ? "square"
        : kind === "EBOOK"
          ? "book"
          : "wide";
  const seeAll = kind ? SEE_ALL[kind] : s.kind === "collection" ? "/collections" : undefined;
  return (
    <MediaRow
      title={s.displayTitle}
      {...(seeAll ? { seeAll } : {})}
      empty={items.length === 0}
      variant={variant}
    >
      {items.map((i) => (
        <ItemCard key={`${i.type}-${i.slug}`} item={i} />
      ))}
    </MediaRow>
  );
}

/** One section, rendered by what the server says it is (`kind`) - never by guessing from its key. */
function Section({ s }: { s: ApiHomeSection }) {
  switch (s.kind) {
    case "hero": {
      const slides = heroSlides((s.items ?? []) as unknown as ApiMixedCard[]);
      return slides.length ? <HeroBanner slides={slides} /> : null;
    }
    case "continue":
      return <ContinueRow title={s.displayTitle} limit={s.itemLimit} />;
    case "banner":
      return s.banner ? <BannerSection banner={s.banner} /> : null;
    case "collections":
      return (s.collections?.length ?? 0) > 0 ? (
        <MediaRow title={s.displayTitle} seeAll="/collections">
          {s.collections!.slice(0, s.itemLimit).map((c) => (
            <CollectionCard key={c.id} c={{ id: c.id, slug: c.slug, name: c.name, description: "", cover: c.image ?? "", status: "Published", items: [] }} />
          ))}
        </MediaRow>
      ) : null;
    default:
      return (s.items?.length ?? 0) > 0 ? <ContentRow s={s} /> : null;
  }
}

/**
 * The customer homepage in live mode. The page shell (header, footer) is already on screen from the layout; this paints
 * skeletons at once, loads the first two sections with priority, and brings the rest in once the browser is idle or the
 * reader nears them. Order and presence come only from Admin -> Homepage.
 */
export function LiveHome() {
  const first = useApiHomepagePages();
  const total = first.data?.meta?.total ?? first.data?.data?.length ?? 0;
  const firstSections = first.data?.data ?? [];

  if (first.isLoading) {
    return (
      <div aria-busy="true">
        <SectionSkeleton hero />
        <div className="relative z-10 space-y-10 pt-8 md:-mt-16">
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  if (first.isError) {
    return (
      <div className="px-4 pt-8 md:px-8">
        <EmptyState
          icon={Film}
          title="The homepage could not be loaded"
          sub="Check your connection and try again."
          action={
            <button
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold"
              onClick={() => void first.refetch()}
            >
              Try again
            </button>
          }
        />
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="px-4 pt-8 md:px-8">
        <EmptyState
          icon={Film}
          title="Nothing to watch yet"
          sub="New titles are added all the time. Check back soon."
        />
      </div>
    );
  }

  const hasHeroFirst = firstSections[0]?.kind === "hero" || firstSections[0]?.kind === "banner";
  return (
    <>
      <div
        className={
          hasHeroFirst ? "relative z-10 space-y-10 md:-mt-0" : "relative z-10 space-y-10 pt-8"
        }
      >
        {firstSections.map((s) => (
          <Section key={s.id} s={s} />
        ))}
      </div>
    </>
  );
}
