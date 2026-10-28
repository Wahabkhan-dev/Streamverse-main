import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

/** Assets that are real library entries: not soft-deleted and not an internal rendition (HLS variant, etc.). */
export const LIBRARY_BASE: Prisma.MediaAssetWhereInput = { deletedAt: null, sourceAssetId: null, status: { not: "DELETED" } };

export const findPage = (where: Prisma.MediaAssetWhereInput, orderBy: Prisma.MediaAssetOrderByWithRelationInput[], skip: number, take: number) =>
  prisma.mediaAsset.findMany({ where, orderBy, skip, take });

export const count = (where: Prisma.MediaAssetWhereInput) => prisma.mediaAsset.count({ where });

/** One aggregate query for every counter + the storage total on the page header. */
export const groupByTypeAndStatus = () => prisma.mediaAsset.groupBy({ by: ["type", "status"], where: LIBRARY_BASE, _count: { _all: true }, _sum: { sizeBytes: true } });

export const findDetail = (id: string) => prisma.mediaAsset.findFirst({ where: { id, deletedAt: null } });
export const findRenditions = (sourceAssetId: string) => prisma.mediaAsset.findMany({ where: { sourceAssetId }, orderBy: { createdAt: "asc" } });

export const updateMetadata = (id: string, data: Prisma.MediaAssetUncheckedUpdateInput) => prisma.mediaAsset.update({ where: { id }, data });

export const usersByIds = (ids: string[]) => (ids.length ? prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : Promise.resolve([] as Array<{ id: string; fullName: string }>));

export const contentsMatching = (q: string) =>
  prisma.content.findMany({ where: { deletedAt: null, OR: [{ title: { contains: q } }, { contentCode: { contains: q } }] }, select: { id: true }, take: 100 });

export const existingKeys = async (keys: string[]) => (keys.length ? (await prisma.mediaAsset.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } })).map((r) => r.storageKey) : []);

/** READY assets in least-recently-checked order — the reconciliation cursor. */
export const nextToVerify = (take: number) => prisma.mediaAsset.findMany({ where: { ...LIBRARY_BASE, status: { in: ["READY", "MISSING"] }, storageKey: { not: null } }, orderBy: [{ checkedAt: "asc" }, { createdAt: "asc" }], take });
export const markChecked = (ids: string[]) => prisma.mediaAsset.updateMany({ where: { id: { in: ids } }, data: { checkedAt: new Date() } });
