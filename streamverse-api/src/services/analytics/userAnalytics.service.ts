import * as repo from "../../repositories/analytics.repository";
import { type DateRange, dailyBuckets, weeklyBuckets, monthlyBuckets, formatDate } from "../../utils/dateRange";

export type GroupBy = "day" | "week" | "month";

export interface UserGrowthPoint {
  date: string;
  newUsers: number;
  cumulativeUsers: number;
}

export interface UserGrowthResult {
  timeSeries: UserGrowthPoint[];
  activeUsers: number;
  totalNewUsers: number;
}

export async function getUserGrowth(range: DateRange, groupBy: GroupBy = "day"): Promise<UserGrowthResult> {
  const [newUsersRows, activeUsers] = await Promise.all([
    repo.getUsersCreatedInRange(range.from, range.to),
    repo.getActiveUsersInRange(range.from, range.to),
  ]);

  // Build bucket list
  const buckets = groupBy === "day" ? dailyBuckets(range.from, range.to) : groupBy === "week" ? weeklyBuckets(range.from, range.to) : monthlyBuckets(range.from, range.to);

  // Count new users per bucket key
  const newPerBucket: Record<string, number> = {};
  for (const bucket of buckets) newPerBucket[bucket] = 0;

  for (const u of newUsersRows) {
    const bucketKey = matchBucket(u.createdAt, buckets, groupBy);
    if (bucketKey) newPerBucket[bucketKey] = (newPerBucket[bucketKey] ?? 0) + 1;
  }

  // Cumulative total up to start of range
  const baseCumulative = await repo.getTotalUsersAsOf(new Date(range.from.getTime() - 1));
  let cumulative = baseCumulative;
  const timeSeries: UserGrowthPoint[] = buckets.map((date) => {
    const newUsers = newPerBucket[date] ?? 0;
    cumulative += newUsers;
    return { date, newUsers, cumulativeUsers: cumulative };
  });

  return { timeSeries, activeUsers, totalNewUsers: newUsersRows.length };
}

function matchBucket(date: Date, buckets: string[], groupBy: GroupBy): string | null {
  if (!buckets.length) return null;
  const dateStr = formatDate(date);
  if (groupBy === "day") {
    return buckets.includes(dateStr) ? dateStr : null;
  }
  // For week/month: find the bucket whose start date is <= date < next bucket start
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (dateStr >= buckets[i]!) return buckets[i]!;
  }
  return null;
}
