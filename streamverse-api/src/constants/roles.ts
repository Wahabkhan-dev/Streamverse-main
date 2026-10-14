/** Only two roles exist. There is no publisher, moderator, creator or super admin. */
export const ROLES = ["USER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];
export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "DELETED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
