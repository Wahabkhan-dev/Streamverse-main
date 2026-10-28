import { useMemo } from "react";
import { useApiBannersQuery } from "@/hooks/useApiCatalog";
import { DEMO_MODE } from "@/lib/config";
import { linkFor } from "@/lib/links";
import type { ApiBanner } from "@/api/types";
import { HeroBanner, type HeroSlide } from "./media";

type Placement = "MOVIES" | "EBOOKS" | "AUDIOBOOKS";
const KIND: Record<string, "movie" | "ebook" | "audiobook"> = { MOVIE: "movie", EBOOK: "ebook", AUDIOBOOK: "audiobook" };

/**
 * The big banner at the top of the Movies / eBooks / Audiobooks pages. It shows the active Hero banners an admin set for
 * that page (Admin -> Banners). The HOMEPAGE hero is different: it is managed in Admin -> Homepage.
 */
export function SubpageHero({ placement }: { placement: Placement }) {
  const query = useApiBannersQuery(placement);
  const slides = useMemo<HeroSlide[]>(
    () =>
      (query.data ?? [])
        .map((raw: ApiBanner) => raw as unknown as { id: string; type: string; title: string; description?: string | null; buttonText?: string | null; image?: string | null; mobileImage?: string | null; linkToSubscription?: boolean; linkedContent?: { type: string; slug: string } | null })
        .filter((b) => b.type === "HERO" && b.image)
        .map((b) => {
          const kind = b.linkedContent ? KIND[b.linkedContent.type] : undefined;
          const target = b.linkToSubscription ? linkFor("subscription", "") : kind && b.linkedContent ? linkFor(kind, b.linkedContent.slug) : undefined;
          return { key: b.id, image: b.image!, mobileImage: b.mobileImage ?? b.image!, title: b.title, description: b.description ?? "", buttonText: b.buttonText || "Learn more", ...(target ? { target } : {}) };
        }),
    [query.data],
  );
  if (DEMO_MODE || !slides.length) return null;
  return <HeroBanner slides={slides} />;
}
