import { z } from "zod";

/** An announcement every active customer receives in their notifications (the bell and the Notifications page). */
export const createAnnouncementSchema = z.object({
  kind: z.enum(["NEW_RELEASE", "SUBSCRIPTION", "RECOMMENDATION", "ACCOUNT", "SYSTEM"]).default("SYSTEM"),
  title: z.string().trim().min(1, "Add a title for the announcement.").max(120, "Keep the title under 120 characters."),
  message: z.string().trim().max(2000, "Keep the message under 2000 characters.").default(""),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
