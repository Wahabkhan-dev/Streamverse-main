import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

export const createSection = (data: Prisma.HomepageSectionUncheckedCreateInput) => prisma.homepageSection.create({ data });
export const updateSection = (id: string, data: Prisma.HomepageSectionUncheckedUpdateInput) => prisma.homepageSection.update({ where: { id }, data });
export const findSectionById = (id: string) => prisma.homepageSection.findUnique({ where: { id } });
export const findSectionByKey = (key: string) => prisma.homepageSection.findUnique({ where: { key } });
export const listSections = () => prisma.homepageSection.findMany({ orderBy: { displayOrder: "asc" } });
export const deleteSection = (id: string) => prisma.homepageSection.delete({ where: { id } });
export const reorderSections = (items: { id: string; displayOrder: number }[]) => Promise.all(items.map((i) => prisma.homepageSection.update({ where: { id: i.id }, data: { displayOrder: i.displayOrder } })));

export const addItem = (sectionId: string, contentId: string, displayOrder = 0) => prisma.homepageSectionItem.create({ data: { sectionId, contentId, displayOrder } });
export const removeItem = (sectionId: string, contentId: string) => prisma.homepageSectionItem.deleteMany({ where: { sectionId, contentId } });
export const itemExists = async (sectionId: string, contentId: string) => (await prisma.homepageSectionItem.count({ where: { sectionId, contentId } })) > 0;
export const itemsFor = (sectionId: string) => prisma.homepageSectionItem.findMany({ where: { sectionId }, include: { content: true }, orderBy: { displayOrder: "asc" } });

/** Same rows, with Content's shared relations too — for the customer read, which needs genres/tags/etc. */
export const itemsWithContent = (sectionId: string) =>
  prisma.homepageSectionItem.findMany({
    where: { sectionId },
    orderBy: { displayOrder: "asc" },
    include: { content: { include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, languages: { include: { language: true } }, warnings: { include: { warningType: true } } } } },
  });
export const reorderItems = (sectionId: string, items: { contentId: string; displayOrder: number }[]) =>
  Promise.all(items.map((i) => prisma.homepageSectionItem.updateMany({ where: { sectionId, contentId: i.contentId }, data: { displayOrder: i.displayOrder } })));
