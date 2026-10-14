/**
 * Phase 8: age verification persistence.
 * The raw `dateOfBirth` is stored but NEVER returned to clients — only computed age and method are exposed.
 */
import { prisma } from "../config/database";

export const findByUserId = (userId: string) =>
  prisma.userAgeVerification.findUnique({ where: { userId } });

export const upsert = (userId: string, data: { dateOfBirth: Date; verifiedAge: number; method: string; verifiedAt?: Date }) =>
  prisma.userAgeVerification.upsert({
    where: { userId },
    create: { userId, ...data, verifiedAt: data.verifiedAt ?? new Date() },
    update: { dateOfBirth: data.dateOfBirth, verifiedAge: data.verifiedAge, method: data.method, verifiedAt: data.verifiedAt ?? new Date() },
  });
