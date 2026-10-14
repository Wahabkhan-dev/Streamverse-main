import type { User } from "@prisma/client";
import { NotFoundError } from "../utils/errors";
import * as userRepository from "../repositories/user.repository";
import type { ProfileUpdateInput } from "../repositories/user.repository";

/** What the API ever returns for a user. passwordHash and every other internal field stay out by construction. */
export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: User["role"];
  status: User["status"];
  emailVerified: boolean;
  preferences: {
    country: string | null;
    preferredLanguage: string | null;
    subtitleLanguage: string | null;
    audioLanguage: string | null;
    videoQuality: string | null;
    audiobookSpeed: number | null;
  };
  createdAt: string;
  lastLoginAt: string | null;
}

/** The one place a User row is turned into an API response. Never spread a raw Prisma User into JSON. */
export function serializeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    preferences: {
      country: user.country,
      preferredLanguage: user.preferredLanguage,
      subtitleLanguage: user.subtitleLanguage,
      audioLanguage: user.audioLanguage,
      videoQuality: user.videoQuality,
      audiobookSpeed: user.audiobookSpeed,
    },
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

export async function getProfile(userId: string): Promise<SafeUser> {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError("Account not found");
  return serializeUser(user);
}

/** Only ever called with the already-validated, already-restricted fields from profileUpdateSchema. */
export async function updateProfile(userId: string, input: ProfileUpdateInput): Promise<SafeUser> {
  const user = await userRepository.updateProfile(userId, input);
  return serializeUser(user);
}
