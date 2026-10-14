import type { ItemType } from "./data";
import type { LinkKind } from "./store";

export interface LinkTarget {
  to: string;
  params?: Record<string, string>;
}

/** Where a banner / collection / history entry should send the customer. */
export function linkFor(kind: LinkKind, slug: string): LinkTarget | undefined {
  switch (kind) {
    case "movie":
      return { to: "/movies/$slug", params: { slug } };
    case "ebook":
      return { to: "/ebooks/$slug", params: { slug } };
    case "audiobook":
      return { to: "/audiobooks/$slug", params: { slug } };
    case "collection":
      return { to: "/collections/$slug", params: { slug } };
    case "subscription":
      return { to: "/subscription" };
    default:
      return undefined;
  }
}

export const detailTarget = (type: ItemType, slug: string): LinkTarget => linkFor(type === "Movie" ? "movie" : type === "eBook" ? "ebook" : "audiobook", slug)!;
export const playTarget = (type: ItemType, slug: string): LinkTarget => ({ to: type === "Movie" ? "/watch/$slug" : type === "eBook" ? "/read/$slug" : "/listen/$slug", params: { slug } });
