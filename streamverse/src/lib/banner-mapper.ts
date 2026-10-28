import type { ApiBanner } from "@/api/types";
import type { Banner, BannerType, LinkKind } from "@/lib/store";

const BANNER_TYPE_LABEL: Record<string, BannerType> = {
  HERO: "Hero Banner",
  NORMAL: "Normal Banner",
  LATEST_RELEASE: "Latest Release Banner",
  PROMOTIONAL: "Promotional Banner",
};
const LINK_KIND: Record<string, LinkKind> = { MOVIE: "movie", EBOOK: "ebook", AUDIOBOOK: "audiobook" };

/** The customer banners API sends signed picture URLs and the linked title; the server already applied dates and visibility. */
export function apiBannerToLocal(raw: ApiBanner): Banner {
  const b = raw as unknown as {
    id: string;
    type: string;
    title: string;
    description?: string | null;
    buttonText?: string | null;
    image?: string | null;
    mobileImage?: string | null;
    priority: number;
    linkToSubscription?: boolean;
    linkedContent?: { id: string; type: string; slug: string } | null;
  };
  const kind: LinkKind = b.linkToSubscription ? "subscription" : b.linkedContent ? (LINK_KIND[b.linkedContent.type] ?? "none") : "none";
  const image = b.image ?? "";
  return {
    id: b.id,
    type: BANNER_TYPE_LABEL[b.type] ?? "Normal Banner",
    title: b.title,
    description: b.description ?? "",
    buttonText: b.buttonText ?? "",
    linkKind: kind,
    ...(b.linkedContent && kind !== "none" && kind !== "subscription" ? { linkId: b.linkedContent.id } : {}),
    linkSlug: kind !== "none" && kind !== "subscription" ? (b.linkedContent?.slug ?? "") : "",
    image,
    mobileImage: b.mobileImage ?? image,
    priority: b.priority,
    start: "",
    end: "",
    active: true,
  };
}

