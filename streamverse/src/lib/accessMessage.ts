import { isApiError } from "@/api/client";

/**
 * The text to show when playing, reading or listening could not start. The server's own sentence (device limit, stream limit,
 * "your plan doesn't include eBooks", ...) is shown as it is, because it already says why and what to do; only an offline
 * copy that expired, or a failure with nothing useful to say, gets a message from here.
 */
export function accessMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    if (err.code === "DOWNLOAD_EXPIRED") return "This download has expired. Connect to the internet to renew it.";
    if (err.status >= 400 && err.status < 500 && err.message && !/^[A-Z_]+$/.test(err.message)) return err.message;
  }
  return fallback;
}

/** When the server answered but did not let the customer in, its reason in words (falls back to a general sentence). */
export function deniedMessage(access: { message?: string } | undefined, fallback = "You can't open this title with your current plan."): string {
  return access?.message ?? fallback;
}
