import type { Prisma, User } from "@prisma/client";
import { prisma } from "../config/database";

export type { User };

export const findByEmail = (email: string): Promise<User | null> => prisma.user.findUnique({ where: { email } });

export const findById = (id: string): Promise<User | null> => prisma.user.findUnique({ where: { id } });

export const create = (data: { email: string; passwordHash: string; fullName: string }): Promise<User> =>
  prisma.user.create({ data: { email: data.email, passwordHash: data.passwordHash, fullName: data.fullName } });

export const updatePasswordHash = (id: string, passwordHash: string): Promise<User> => prisma.user.update({ where: { id }, data: { passwordHash } });

export const touchLastLogin = (id: string): Promise<User> => prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });

export type ProfileUpdateInput = Partial<
  Pick<Prisma.UserUpdateInput, "fullName" | "avatarUrl" | "country" | "preferredLanguage" | "subtitleLanguage" | "audioLanguage" | "videoQuality" | "audiobookSpeed">
>;

export const updateProfile = (id: string, data: ProfileUpdateInput): Promise<User> => prisma.user.update({ where: { id }, data });

/** Phase 7 (Section 5/6): set exactly once, the first time a user enters a billing flow. */
export const setStripeCustomerId = (id: string, stripeCustomerId: string): Promise<User> => prisma.user.update({ where: { id }, data: { stripeCustomerId } });
export const findByStripeCustomerId = (stripeCustomerId: string): Promise<User | null> => prisma.user.findUnique({ where: { stripeCustomerId } });

/**
 * Conditional update: only sets stripeCustomerId if the column is still null.
 * Returns the number of rows updated (0 = another request already won the race).
 */
export const setStripeCustomerIdIfNull = (id: string, stripeCustomerId: string): Promise<{ count: number }> =>
  prisma.user.updateMany({ where: { id, stripeCustomerId: null }, data: { stripeCustomerId } });
