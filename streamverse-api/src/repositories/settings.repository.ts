import type { SettingValueType } from "@prisma/client";
import { prisma } from "../config/database";

export const findByKey = (key: string) => prisma.appSetting.findUnique({ where: { key } });
export const list = () => prisma.appSetting.findMany({ orderBy: { key: "asc" } });
export const upsert = (key: string, value: string, type: SettingValueType, updatedById?: string) =>
  prisma.appSetting.upsert({ where: { key }, create: { key, value, type, updatedById }, update: { value, type, updatedById } });
