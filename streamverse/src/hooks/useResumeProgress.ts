import { useQuery } from "@tanstack/react-query";
import { meApi } from "@/api/me.api";
import { DEMO_MODE } from "@/lib/config";
import { useIsAuthenticated } from "@/lib/authState";
import type { ItemRef } from "@/lib/data";
import { useProgressOf } from "@/lib/user";

const API_TYPE = { Movie: "movie", eBook: "ebook", Audiobook: "audiobook" } as const;

/**
 * How far this customer got in a title, for the "Resume" / "Continue Reading" button and the "% watched" bar.
 * Live mode: the account's saved position on the server (the same one the player resumes from), so it is right after a
 * sign-in, on another device or in a fresh browser. Demo mode: the browser store, as before.
 */
export function useResumeProgress(ref: ItemRef & { id?: string }): { pct: number; completed: boolean } | undefined {
  const local = useProgressOf(ref);
  const authed = useIsAuthenticated();
  const type = API_TYPE[ref.type];
  const server = useQuery({
    queryKey: ["me", "progress", type, ref.id],
    queryFn: async () => (await meApi.getProgress(type, ref.id!)).data ?? null,
    enabled: !DEMO_MODE && authed && !!ref.id,
    staleTime: 0, // coming back from the player must show where they stopped just now
  });
  if (DEMO_MODE) return local ? { pct: local.pct, completed: !!local.completed } : undefined;
  const p = server.data;
  return p ? { pct: Number(p.percentage) || 0, completed: !!p.completed } : undefined;
}
