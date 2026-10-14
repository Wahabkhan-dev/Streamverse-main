import { Link } from "@tanstack/react-router";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { linkFor } from "@/lib/links";
import { todayIso } from "@/lib/items";
import type { Banner, BannerType } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Tag } from "./ui";

/** Active banners of one type, inside their date window, highest priority first. */
export function activeBanners(banners: Banner[], type: BannerType, today = todayIso()): Banner[] {
  return banners
    .filter((b) => b.type === type && b.active && (!b.start || b.start <= today) && (!b.end || b.end >= today))
    .sort((a, b) => a.priority - b.priority);
}

function BannerLink({ banner, className, children }: { banner: Banner; className?: string; children: React.ReactNode }) {
  const t = linkFor(banner.linkKind, banner.linkSlug);
  if (!t) return <div className={className}>{children}</div>;
  return (
    <Link to={t.to as "/"} {...(t.params ? { params: t.params as never } : {})} className={className}>
      {children}
    </Link>
  );
}

const Art = ({ banner, className }: { banner: Banner; className?: string }) => (
  <picture>
    {banner.mobileImage && <source media="(max-width: 767px)" srcSet={banner.mobileImage} />}
    <img src={banner.image} alt="" loading="lazy" className={cn("absolute inset-0 size-full object-cover", className)} />
  </picture>
);

const hasLink = (b: Banner) => !!b.buttonText && !!linkFor(b.linkKind, b.linkSlug);

/** Promotional Banner: a slim campaign message with a red accent. */
export function PromotionalBanner({ banner }: { banner: Banner }) {
  return (
    <div className="mx-4 md:mx-8">
      <BannerLink banner={banner} className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-primary/30 bg-surface px-4 py-3 transition-colors hover:border-primary/60 sm:gap-4 sm:px-5 sm:py-4">
        <Art banner={banner} className="opacity-20 transition-opacity group-hover:opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/25 via-ink/85 to-ink" />
        <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
        <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary-text ring-1 ring-primary/30 sm:size-10">
          <Sparkles className="size-4 sm:size-5" />
        </span>
        <div className="relative min-w-0 flex-1">
          <div className="truncate text-sm font-bold md:text-base">{banner.title}</div>
          <div className="line-clamp-1 text-xs text-soft md:text-sm">{banner.description}</div>
        </div>
        {hasLink(banner) && (
          <span className="relative hidden shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold shadow-red transition-colors group-hover:bg-primary-hover sm:inline-flex">
            {banner.buttonText} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </BannerLink>
    </div>
  );
}

/** Normal Banner: a cinematic feature between rows. */
export function NormalBanner({ banner }: { banner: Banner }) {
  return (
    <div className="mx-4 md:mx-8">
      <BannerLink banner={banner} className="group relative block h-44 overflow-hidden rounded-2xl border border-border shadow-card transition-all duration-300 hover:border-primary/40 sm:h-48 lg:h-56 xl:h-60">
        <Art banner={banner} className="transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-ink/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
        <div className="absolute inset-y-0 left-0 flex max-w-[88%] flex-col justify-center p-4 sm:max-w-md sm:p-6 lg:max-w-xl lg:p-9">
          <span className="mb-1.5 inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] text-primary-text uppercase sm:mb-2">
            <span className="h-0.5 w-5 rounded-full bg-primary" aria-hidden="true" />
            Spotlight
          </span>
          <h2 className="line-clamp-2 text-xl font-black tracking-tight sm:text-2xl lg:text-4xl">{banner.title}</h2>
          <p className="mt-1 line-clamp-1 text-xs text-soft sm:line-clamp-2 sm:text-sm lg:text-base">{banner.description}</p>
          {hasLink(banner) && (
            <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-md bg-foreground px-3.5 py-1.5 text-xs font-bold text-ink transition-colors group-hover:bg-primary group-hover:text-primary-foreground sm:mt-4 sm:px-5 sm:py-2.5 sm:text-sm">
              {banner.buttonText} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      </BannerLink>
    </div>
  );
}

/** Latest Release Banner: a compact spotlight on something new. */
export function LatestReleaseBanner({ banner }: { banner: Banner }) {
  const watchable = banner.linkKind === "movie" || banner.linkKind === "audiobook";
  return (
    <div className="mx-4 md:mx-8">
      <BannerLink banner={banner} className="group relative grid overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-all duration-300 hover:border-primary/40 md:h-56 md:grid-cols-[1.1fr_1fr] xl:h-60">
        <div className="relative h-32 overflow-hidden sm:h-40 md:h-full">
          <Art banner={banner} className="transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent md:bg-gradient-to-r md:from-transparent md:via-transparent md:to-surface" />
          {watchable && (
            <span className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-foreground/80 bg-ink/50 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 max-md:hidden">
              <Play className="size-5 fill-current" />
            </span>
          )}
        </div>
        <div className="relative flex min-w-0 flex-col justify-center gap-1.5 p-4 sm:gap-2 sm:p-5 lg:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]" aria-hidden="true" />
          <span className="relative self-start">
            <Tag tone="red">New release</Tag>
          </span>
          <h2 className="relative line-clamp-2 text-lg font-black tracking-tight sm:text-xl lg:text-3xl">{banner.title}</h2>
          <p className="relative line-clamp-2 text-xs text-soft sm:text-sm">{banner.description}</p>
          {hasLink(banner) && (
            <span className="relative mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-bold shadow-red transition-colors group-hover:bg-primary-hover sm:mt-2 sm:px-5 sm:py-2.5 sm:text-sm">
              {banner.buttonText} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      </BannerLink>
    </div>
  );
}
