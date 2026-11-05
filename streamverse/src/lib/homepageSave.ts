import type { ApiHomeSection } from "@/api/types";

type AutoFlag = "featured" | "newRelease" | "trending" | "popular";

const FLAG_TO_TYPE: Record<AutoFlag, ApiHomeSection["type"]> = {
  featured: "FEATURED",
  newRelease: "NEW_RELEASE",
  trending: "TRENDING",
  popular: "POPULAR",
};

/** Which automatic list a section falls back to when it goes from Manual back to Automatic and nobody chose one. */
function defaultFlagFor(key: string): AutoFlag {
  const k = key.toLowerCase();
  if (k.includes("trend")) return "trending";
  if (k.includes("popular")) return "popular";
  if (k.includes("new") || k.includes("latest") || k.includes("release")) return "newRelease";
  return "featured";
}

/** The hero is Manual when it has picked titles (the server shows them, else falls back to Featured); it never changes type. */
export const isHeroSection = (o: Pick<ApiHomeSection, "key" | "type">) => o.type === "HERO" || o.key === "hero";

/** Whether a section is saved as Manual: a MANUAL section, or a hero that has picks. */
export const savedAsManual = (o: Pick<ApiHomeSection, "key" | "type" | "items">) => o.type === "MANUAL" || (isHeroSection(o) && (o.items?.length ?? 0) > 0);

export interface SectionSavePlan {
  /** set when the section's type has to change (Automatic <-> Manual) */
  type?: ApiHomeSection["type"];
  /** required by the server when going back to an automatic type */
  contentType?: NonNullable<ApiHomeSection["contentType"]>;
  add: { contentId: string; displayOrder: number }[];
  remove: string[];
  /** the final order of the picks, sent after the adds and removes */
  order: { contentId: string; displayOrder: number }[] | null;
  /** picked titles with no content id (cannot be saved) */
  unsaveable: number;
}

/**
 * What saving must do for one section so that the server ends up exactly as the page shows it. `local` is the section as edited
 * on the page; `orig` is the server's copy. The page used to save only title, on/off, limit and order, so Manual and the picked
 * titles lived in the browser alone and were gone after Save.
 */
export function planSectionSave(local: { id: string; mode: "auto" | "manual"; autoFlag?: AutoFlag | undefined; items: { id?: string | undefined }[] }, orig: ApiHomeSection): SectionSavePlan {
  const plan: SectionSavePlan = { add: [], remove: [], order: null, unsaveable: 0 };
  const wantsManual = local.mode === "manual";
  const wasManual = savedAsManual(orig);
  const hero = isHeroSection(orig);
  const stored = (orig.items ?? []).map((i) => i.contentId);

  if (wantsManual) {
    if (!hero && orig.type !== "MANUAL") plan.type = "MANUAL";
    const want = local.items.map((i) => i.id).filter((id): id is string => !!id);
    plan.unsaveable = local.items.length - want.length;
    plan.add = want.filter((id) => !stored.includes(id)).map((contentId) => ({ contentId, displayOrder: want.indexOf(contentId) }));
    plan.remove = stored.filter((id) => !want.includes(id));
    const keptOrder = stored.filter((id) => want.includes(id));
    const sameOrder = plan.add.length === 0 && keptOrder.join() === want.join();
    if (want.length > 0 && !sameOrder) plan.order = want.map((contentId, i) => ({ contentId, displayOrder: i }));
    return plan;
  }

  // Automatic
  if (hero) {
    plan.remove = stored; // the hero shows its picks whenever it has any
  } else if (wasManual) {
    plan.type = FLAG_TO_TYPE[local.autoFlag ?? defaultFlagFor(orig.key)];
    plan.contentType = orig.contentType ?? "MOVIE";
  }
  return plan;
}
