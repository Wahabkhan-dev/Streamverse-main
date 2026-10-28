import { useQuery } from "@tanstack/react-query";
import { meApi } from "@/api/me.api";
import { useIsAuthenticated } from "@/lib/authState";
import type { ApiMixedCard } from "@/api/types";
import { mixedCardToItem } from "@/lib/api-mappers";
import { runtimeSeconds, timeLeft } from "@/lib/runtime";
import { ItemCard } from "../ItemCard";
import { MediaRow, ProgressCard } from "../media";

type ContinueCard = ApiMixedCard & { percentage: number };

/** Continue Watching / Reading / Listening: the signed-in customer's own unfinished titles, straight from the server. */
export function ContinueRow({ title, limit }: { title: string; limit: number }) {
  const authed = useIsAuthenticated();
  const q = useQuery({
    queryKey: ["me", "continue"],
    enabled: authed,
    queryFn: async () => {
      const g = (await meApi.getContinueWatching()).data as unknown as {
        movies?: ContinueCard[];
        ebooks?: ContinueCard[];
        audiobooks?: ContinueCard[];
      };
      return [...(g.movies ?? []), ...(g.ebooks ?? []), ...(g.audiobooks ?? [])];
    },
    staleTime: 15_000,
    retry: false,
  });
  const entries = (q.data ?? []).filter((e) => e.percentage > 0 && e.percentage < 100).slice(0, limit);
  // signed-out visitors and customers with nothing in progress simply do not get this row
  if (!authed || (!q.isLoading && entries.length === 0)) return null;
  return (
    <MediaRow title={title} loading={q.isLoading} empty={entries.length === 0}>
      {entries.map((e) => {
        const item = mixedCardToItem(e);
        if (item.type === "Movie") {
          return (
            <ProgressCard
              key={item.slug}
              m={item.m}
              progress={e.percentage}
              left={timeLeft(runtimeSeconds(item.m.runtime) * (1 - e.percentage / 100))}
            />
          );
        }
        return <ItemCard key={`${item.type}-${item.slug}`} item={item} />;
      })}
    </MediaRow>
  );
}
