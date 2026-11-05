import type { AccessDenialReason } from "./entitlement.service";

const KIND_WORDS: Record<string, string> = { movie: "movies", ebook: "eBooks", audiobook: "audiobooks" };

/**
 * Why a title can't be opened, in words a customer can act on. Every client shows this text as it is, so the reason is never a
 * bare code ("PLAN_NOT_ELIGIBLE") or a misleading "not ready".
 */
export function denialMessage(reason: AccessDenialReason, contentType?: string): string {
  switch (reason) {
    case "AUTH_REQUIRED":
      return "Please sign in to watch, read or listen to this title.";
    case "ACCOUNT_SUSPENDED":
      return "Your account is suspended, so you can't play anything right now. Please contact support to get it restored.";
    case "SUBSCRIPTION_REQUIRED":
      return "This title is for subscribers. Choose a plan to start enjoying it.";
    case "SUBSCRIPTION_INACTIVE":
      return "Your subscription isn't active right now (it may have ended, been canceled, or a payment may have failed). Renew it or update your payment method to continue.";
    case "PLAN_NOT_ELIGIBLE": {
      const kind = contentType ? KIND_WORDS[contentType] : undefined;
      return kind ? `Your current plan doesn't include ${kind}. Upgrade to a plan that does to open this title.` : "Your current plan doesn't include this kind of title. Upgrade to a plan that does to open it.";
    }
    case "AGE_NOT_VERIFIED":
      return "This title is age-restricted. Please verify your age to open it.";
    case "AGE_RESTRICTED":
      return "This title is rated above the age on your account, so it can't be opened.";
    case "REGION_RESTRICTED":
      return "This title isn't available in your country.";
    case "NOT_YET_AVAILABLE":
      return "This title isn't available yet. Please check back after its release date.";
    case "AVAILABILITY_EXPIRED":
      return "This title is no longer available.";
    case "MEDIA_NOT_READY":
      return "The file for this title is still being prepared. Please try again a little later.";
    case "CONTENT_NOT_FOUND":
    case "NOT_PUBLISHED":
    case "CONTENT_UNAVAILABLE":
    default:
      return "This title isn't available right now.";
  }
}

/** The plan name, or a neutral phrase, for limit messages. */
const planPhrase = (name?: string | null) => (name ? `Your ${name} plan` : "Your plan");
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function deviceLimitMessage(max: number, planName?: string | null): string {
  return `${planPhrase(planName)} allows ${count(max, "device", "devices")}, and ${max === 1 ? "it is" : "all of them are"} already in use. Remove a device you no longer use (Subscription → Your devices), or upgrade your plan to add more.`;
}

export function streamLimitMessage(max: number, planName?: string | null): string {
  return `${planPhrase(planName)} allows ${count(max, "stream", "streams")} at the same time, and ${max === 1 ? "it is" : "all of them are"} already playing. Stop playback on another device to continue here, or upgrade your plan to watch on more screens.`;
}
