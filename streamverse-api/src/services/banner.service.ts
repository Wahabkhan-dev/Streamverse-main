import * as bannerRepository from "../repositories/banner.repository";
import * as contentRepository from "../repositories/content.repository";
import { assertNotStale } from "../utils/concurrency";
import { NotFoundError, ValidationError } from "../utils/errors";
import { buildPagination, toSkipTake } from "../utils/pagination";
import { isCustomerVisible } from "./contentAccess.service";
import { assertAssetRef } from "./mediaAsset.service";
import type { CreateBannerInput, UpdateBannerInput } from "../validators/banner.validator";
import type { AuditContext } from "./auditLog.service";
import { recordAudit } from "./auditLog.service";

const NO_ACTOR: AuditContext = { userId: undefined, ip: undefined, userAgent: undefined, requestId: undefined };

/** Section 38: linkedContentId must name a real (active) title if supplied. */
async function assertLinkedContentValid(linkedContentId: string | undefined) {
  if (!linkedContentId) return;
  if (!(await contentRepository.findActiveById(linkedContentId))) throw new ValidationError([{ path: "linkedContentId", message: "This content does not exist (or was deleted)." }]);
}

// Banner.type PROMOTIONAL has no dedicated MediaAssetType of its own — it reuses NORMAL_BANNER artwork.
const DESKTOP_BANNER_ASSET_TYPES = ["HERO_BANNER", "NORMAL_BANNER", "LATEST_RELEASE_BANNER"] as const;

export async function createBanner(input: CreateBannerInput, ctx: AuditContext = NO_ACTOR) {
  await assertLinkedContentValid(input.linkedContentId);
  await Promise.all([assertAssetRef("desktopAssetId", input.desktopAssetId, [...DESKTOP_BANNER_ASSET_TYPES]), assertAssetRef("mobileAssetId", input.mobileAssetId, ["MOBILE_BANNER"])]);
  const banner = await bannerRepository.create(input);
  await recordAudit(ctx, { action: "banner.created", entityType: "BANNER", entityId: banner.id, metadata: { type: banner.type, title: banner.title } });
  return banner;
}

export async function updateBanner(id: string, input: UpdateBannerInput, ctx: AuditContext = NO_ACTOR) {
  const existing = await bannerRepository.findById(id);
  if (!existing) throw new NotFoundError("Banner not found");
  assertNotStale(existing.updatedAt, input.expectedUpdatedAt);
  await assertLinkedContentValid(input.linkedContentId);
  await Promise.all([assertAssetRef("desktopAssetId", input.desktopAssetId, [...DESKTOP_BANNER_ASSET_TYPES]), assertAssetRef("mobileAssetId", input.mobileAssetId, ["MOBILE_BANNER"])]);
  const { expectedUpdatedAt: _drop, ...data } = input;
  void _drop;
  const updated = await bannerRepository.update(id, data);
  await recordAudit(ctx, { action: "banner.updated", entityType: "BANNER", entityId: id, metadata: { fields: Object.keys(data) } });
  return updated;
}

export async function deleteBanner(id: string, ctx: AuditContext = NO_ACTOR) {
  if (!(await bannerRepository.findById(id))) throw new NotFoundError("Banner not found");
  await bannerRepository.remove(id);
  await recordAudit(ctx, { action: "banner.deleted", entityType: "BANNER", entityId: id });
}

export const getBanner = bannerRepository.findById;

export async function listBanners(filters: { page: number; limit: number; sortBy: "priority" | "createdAt" | "updatedAt" | "startsAt"; sortOrder: "asc" | "desc"; type?: "HERO" | "NORMAL" | "LATEST_RELEASE" | "PROMOTIONAL" | undefined; active?: boolean | undefined }) {
  const { skip, take } = toSkipTake(filters.page, filters.limit);
  const { rows, total } = await bannerRepository.list(filters, skip, take, { [filters.sortBy]: filters.sortOrder });
  return { rows, pagination: buildPagination(total, filters.page, filters.limit) };
}

/* ---------------------------------------------------------------- customer read (Section 15/16) */

/**
 * Section 16 (documented choice): if a banner links to content that is no longer customer-visible, the
 * whole banner is dropped from the response — never shown with a dead link, and never silently shown
 * "unlinked" either (that would misrepresent what it was supposed to point at).
 */
export async function listActiveBannersForCustomer(type?: "HERO" | "NORMAL" | "LATEST_RELEASE" | "PROMOTIONAL") {
  const banners = await bannerRepository.listActiveWithinWindow(type);
  return banners
    .filter((b) => !b.linkedContentId || (b.linkedContent && isCustomerVisible(b.linkedContent)))
    .map((b) => ({
      id: b.id,
      type: b.type,
      title: b.title,
      description: b.description,
      desktopAssetId: b.desktopAssetId,
      mobileAssetId: b.mobileAssetId,
      buttonText: b.buttonText,
      priority: b.priority,
      linkedContent: b.linkedContent ? { id: b.linkedContent.id, type: b.linkedContent.type, slug: b.linkedContent.slug, title: b.linkedContent.title } : null,
    }));
}
