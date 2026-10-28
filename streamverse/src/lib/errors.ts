import { isApiError } from "@/api/client";

export interface FriendlyError {
  /** a short headline */
  title: string;
  /** what happened and what to do, in plain words */
  detail: string;
  /** trying again may help (a connection or server hiccup), as opposed to something the person must change */
  retryable: boolean;
}

/**
 * Turns anything that can go wrong with a request into words a person understands. One place, so every screen, toast and
 * panel says the same thing; the server's own message is used whenever it explains something specific (a rule that was
 * broken, an item that is in use) and is never shown raw when it is only a code.
 */
export function describeError(err: unknown): FriendlyError {
  if (err instanceof TypeError || (err instanceof DOMException && err.name === "NetworkError"))
    return { title: "No connection", detail: "We can't reach StreamVerse. Check your internet connection and try again.", retryable: true };

  if (isApiError(err)) {
    const said = err.message && !/^request failed:|^unknown/i.test(err.message) ? err.message : "";
    switch (true) {
      case err.status === 400 || err.status === 422:
        return { title: "Please check your input", detail: said || "Something in what you entered is not valid.", retryable: false };
      case err.status === 401:
        return { title: "Please sign in again", detail: "Your session has ended. Sign in to continue.", retryable: false };
      case err.status === 403:
        return { title: "Not allowed", detail: said && !/forbidden/i.test(said) ? said : "You don't have permission to do that.", retryable: false };
      case err.status === 404:
        return { title: "Not found", detail: "That item could not be found. It may have been removed.", retryable: false };
      case err.status === 409:
        return { title: "That can't be done right now", detail: said || "This conflicts with something that already exists.", retryable: false };
      case err.status === 413:
        return { title: "File too large", detail: "That file is too large to upload.", retryable: false };
      case err.status === 429:
        return { title: "Slow down a moment", detail: "Too many requests in a short time. Please wait a few seconds and try again.", retryable: true };
      case err.status === 503:
        return { title: "Temporarily unavailable", detail: said || "StreamVerse is busy or temporarily unavailable. Please try again in a moment.", retryable: true };
      case err.status >= 500:
        return { title: "Something went wrong", detail: "Something went wrong on our side. Please try again in a moment.", retryable: true };
      default:
        return { title: "Something went wrong", detail: said || "That didn't work. Please try again.", retryable: true };
    }
  }
  return { title: "Something went wrong", detail: "That didn't work. Please try again.", retryable: true };
}
