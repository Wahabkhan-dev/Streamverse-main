import type { Item } from "./items";
import { isListed, itemEntity, itemTitle } from "./items";
import type { Banner, Collection, LinkKind } from "./store";

const KIND_TYPE = { movie: "Movie", ebook: "eBook", audiobook: "Audiobook" } as const;

/**
 * Resolves a banner against the live catalog. The banner's link follows the stable id (so a slug change
 * never breaks it); a banner whose target was deleted, unpublished or hidden is dropped instead of
 * sending a customer to a dead page. With "use linked content data", blank fields come from the target.
 */
export function resolveBanner(b: Banner, all: Item[], collections: Collection[]): Banner | null {
  if (b.linkKind === "none" || b.linkKind === "subscription") return b;
  if (b.linkKind === "collection") {
    const c = collections.find((x) => (b.linkId ? x.id === b.linkId : x.slug === b.linkSlug));
    return c && c.status === "Published" ? { ...b, linkSlug: c.slug } : null;
  }
  const type = KIND_TYPE[b.linkKind as Exclude<LinkKind, "none" | "subscription" | "collection">];
  const target = all.find((i) => i.type === type && (b.linkId ? itemEntity(i).cid === b.linkId : i.slug === b.linkSlug));
  if (!target || !isListed(itemEntity(target))) return null;
  const e = itemEntity(target);
  const fill = !!b.useLinked;
  const art = target.type === "Movie" ? target.m.image : (target.b.cover ?? "");
  return {
    ...b,
    linkSlug: target.slug,
    title: b.title.trim() || (fill ? itemTitle(target) : b.title),
    description: b.description.trim() || (fill ? e.description : b.description),
    // an uploaded image (data URL) is an override; catalog art / the placeholder follows the linked title
    image: fill && art && !b.image.startsWith("data:") ? art : b.image,
    mobileImage: fill && art && !b.mobileImage.startsWith("data:") ? art : b.mobileImage,
  };
}

export const resolveBanners = (banners: Banner[], all: Item[], collections: Collection[]) => banners.map((b) => resolveBanner(b, all, collections)).filter((b): b is Banner => !!b);
