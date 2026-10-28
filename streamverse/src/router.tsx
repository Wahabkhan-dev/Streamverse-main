import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isApiError } from "./api/client";
import { describeError } from "./lib/errors";
import { createRouter } from "@tanstack/react-router";
import { registerQueryClient } from "./lib/authSession";
import { routeTree } from "./routeTree.gen";

const recent = new Map<string, number>();
/** One toast per distinct message per 6 seconds (a screen with six failing requests says it once). Browser only. */
function toastOnce(message: string) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if ((recent.get(message) ?? 0) > now - 6000) return;
  recent.set(message, now);
  toast.error(message);
}

export const getRouter = () => {
  // Default staleTime avoids an avoidable refetch on every mount/window-focus for admin lists that
  // don't set their own (movies/ebooks/audiobooks/genres/etc). Hooks that need fresher or longer-lived
  // data (dashboard/analytics, customer catalog) already set their own staleTime and win over this.
  const queryClient = new QueryClient({
    // The safety net: a failed request is never silent. A screen that shows its own message uses `meta: { silent: true }`; the
    // rest get one short toast in plain words (the same words again are suppressed for a few seconds).
    queryCache: new QueryCache({
      onError: (err, query) => {
        if (query.meta?.["silent"]) return;
        const status = isApiError(err) ? err.status : 0;
        // network trouble has its own bar; 401/404/400 are normally expected and handled where they happen
        if (status >= 500 || status === 429 || status === 403) toastOnce(describeError(err).detail);
      },
    }),
    mutationCache: new MutationCache({
      onError: (err, _vars, _ctx, mutation) => {
        if (mutation.options.onError || err instanceof TypeError) return; // handled by the caller / by the connection bar
        toastOnce(describeError(err).detail);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // run even with no internet: a downloaded title is answered from the device, anything else fails fast
        networkMode: "offlineFirst",
        retry: (count) => (typeof navigator === "undefined" || navigator.onLine) && count < 2,
      },
    },
  });

  registerQueryClient(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
