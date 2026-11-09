import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const create = (data: Prisma.BannerUncheckedCreateInput) => prisma.banner.create({ data, include: { linkedContent: true } });
export const update = (id: string, data: Prisma.BannerUncheckedUpdateInput) => prisma.banner.update({ where: { id }, data, include: { linkedContent: true } });
export const findById = (id: string) => prisma.banner.findUnique({ where: { id }, include: { linkedContent: true } });
export const remove = (id: string) => prisma.banner.delete({ where: { id } });

export async function list(filters: { type?: Prisma.BannerWhereInput["type"]; active?: boolean }, skip: number, take: number, orderBy: Prisma.BannerOrderByWithRelationInput) {
  const where: Prisma.BannerWhereInput = { ...(filters.type ? { type: filters.type } : {}), ...(filters.active !== undefined ? { active: filters.active } : {}) };
  const [rows, total] = await Promise.all([prisma.banner.findMany({ where, skip, take, orderBy, include: { linkedContent: true } }), prisma.banner.count({ where })]);
  return { rows, total };
}

/** Active banners that chose to appear on the homepage (the service still applies the schedule window and linked-title checks). */
export const listHomepageBanners = () =>
  prisma.banner.findMany({ where: { active: true, showOnHomepage: true, type: { not: "HERO" } }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }], select: { id: true, homepageAfter: true } });

/** Section 15: active + inside its start/end window. Linked content's visibility is checked by the service. */
/** When the next active banner (of this type/placement) is scheduled to start — the moment a cached banner list goes out of date. */
export async function nextStartAfter(now: Date, type?: Prisma.BannerWhereInput["type"], placement?: Prisma.BannerWhereInput["placement"]): Promise<Date | null> {
  const next = await prisma.banner.findFirst({
    where: { active: true, ...(type ? { type } : {}), ...(placement ? { placement } : {}), startsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true },
  });
  return next?.startsAt ?? null;
}

export function listActiveWithinWindow(type: Prisma.BannerWhereInput["type"] | undefined, placement?: Prisma.BannerWhereInput["placement"], now = new Date()) {
  return prisma.banner.findMany({
    where: {
      active: true,
      ...(type ? { type } : {}),
      ...(placement ? { placement } : {}),
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { priority: "asc" },
    include: {
      linkedContent: { include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } },
    },
  });
}
