import * as repo from "../../repositories/analytics.repository";
import { type DateRange } from "../../utils/dateRange";

// ---------------------------------------------------------------------------
// Movie analytics
// ---------------------------------------------------------------------------

export interface TopContentEntry {
  contentId: string;
  title: string;
  starts: number;
  completions: number;
  uniqueViewers: number;
}

export interface MovieAnalyticsResult {
  totalStarts: number;
  uniqueViewers: number;
  completions: number;
  completionRate: number;
  topMovies: TopContentEntry[];
}

export async function getMovieAnalytics(range: DateRange): Promise<MovieAnalyticsResult> {
  const progress = await repo.getMovieProgressInRange(range.from, range.to);

  const statsMap: Record<string, { starts: number; completions: number; users: Set<string> }> = {};
  for (const p of progress) {
    if (!statsMap[p.movieId]) statsMap[p.movieId] = { starts: 0, completions: 0, users: new Set() };
    if (p.percentage > 0) statsMap[p.movieId]!.starts++;
    if (p.completed) statsMap[p.movieId]!.completions++;
    statsMap[p.movieId]!.users.add(p.userId);
  }

  const totalStarts = Object.values(statsMap).reduce((s, v) => s + v.starts, 0);
  const completions = Object.values(statsMap).reduce((s, v) => s + v.completions, 0);
  const uniqueViewers = new Set(progress.filter((p) => p.percentage > 0).map((p) => p.userId)).size;
  const completionRate = totalStarts > 0 ? completions / totalStarts : 0;

  // Top 10 by starts
  const contentIds = Object.keys(statsMap);
  const titles = await repo.getContentTitles(contentIds);
  const titleMap = Object.fromEntries(titles.map((t) => [t.id, t.title]));

  const topMovies: TopContentEntry[] = Object.entries(statsMap)
    .map(([contentId, s]) => ({ contentId, title: titleMap[contentId] ?? contentId, starts: s.starts, completions: s.completions, uniqueViewers: s.users.size }))
    .sort((a, b) => b.starts - a.starts)
    .slice(0, 10);

  return { totalStarts, uniqueViewers, completions, completionRate, topMovies };
}

// ---------------------------------------------------------------------------
// eBook analytics
// ---------------------------------------------------------------------------

export interface EbookAnalyticsResult {
  totalStarts: number;
  uniqueReaders: number;
  completions: number;
  completionRate: number;
  averageProgress: number;
  topEbooks: TopContentEntry[];
}

export async function getEbookAnalytics(range: DateRange): Promise<EbookAnalyticsResult> {
  const progress = await repo.getEbookProgressInRange(range.from, range.to);

  const statsMap: Record<string, { starts: number; completions: number; users: Set<string>; totalProgress: number }> = {};
  for (const p of progress) {
    if (!statsMap[p.ebookId]) statsMap[p.ebookId] = { starts: 0, completions: 0, users: new Set(), totalProgress: 0 };
    if (p.percentage > 0) {
      statsMap[p.ebookId]!.starts++;
      statsMap[p.ebookId]!.totalProgress += p.percentage;
    }
    if (p.completed) statsMap[p.ebookId]!.completions++;
    statsMap[p.ebookId]!.users.add(p.userId);
  }

  const totalStarts = Object.values(statsMap).reduce((s, v) => s + v.starts, 0);
  const completions = Object.values(statsMap).reduce((s, v) => s + v.completions, 0);
  const uniqueReaders = new Set(progress.filter((p) => p.percentage > 0).map((p) => p.userId)).size;
  const completionRate = totalStarts > 0 ? completions / totalStarts : 0;

  const allProgress = progress.filter((p) => p.percentage > 0);
  const averageProgress = allProgress.length > 0 ? allProgress.reduce((s, p) => s + p.percentage, 0) / allProgress.length : 0;

  const contentIds = Object.keys(statsMap);
  const titles = await repo.getContentTitles(contentIds);
  const titleMap = Object.fromEntries(titles.map((t) => [t.id, t.title]));

  const topEbooks: TopContentEntry[] = Object.entries(statsMap)
    .map(([contentId, s]) => ({ contentId, title: titleMap[contentId] ?? contentId, starts: s.starts, completions: s.completions, uniqueViewers: s.users.size }))
    .sort((a, b) => b.starts - a.starts)
    .slice(0, 10);

  return { totalStarts, uniqueReaders, completions, completionRate, averageProgress: Math.round(averageProgress * 10) / 10, topEbooks };
}

// ---------------------------------------------------------------------------
// Audiobook analytics
// ---------------------------------------------------------------------------

export interface AudiobookAnalyticsResult {
  totalStarts: number;
  uniqueListeners: number;
  completions: number;
  completionRate: number;
  averageProgress: number;
  topAudiobooks: TopContentEntry[];
}

export async function getAudiobookAnalytics(range: DateRange): Promise<AudiobookAnalyticsResult> {
  const progress = await repo.getAudiobookProgressInRange(range.from, range.to);

  const statsMap: Record<string, { starts: number; completions: number; users: Set<string> }> = {};
  for (const p of progress) {
    if (!statsMap[p.audiobookId]) statsMap[p.audiobookId] = { starts: 0, completions: 0, users: new Set() };
    if (p.percentage > 0) statsMap[p.audiobookId]!.starts++;
    if (p.completed) statsMap[p.audiobookId]!.completions++;
    statsMap[p.audiobookId]!.users.add(p.userId);
  }

  const totalStarts = Object.values(statsMap).reduce((s, v) => s + v.starts, 0);
  const completions = Object.values(statsMap).reduce((s, v) => s + v.completions, 0);
  const uniqueListeners = new Set(progress.filter((p) => p.percentage > 0).map((p) => p.userId)).size;
  const completionRate = totalStarts > 0 ? completions / totalStarts : 0;

  const allProgress = progress.filter((p) => p.percentage > 0);
  const averageProgress = allProgress.length > 0 ? allProgress.reduce((s, p) => s + p.percentage, 0) / allProgress.length : 0;

  const contentIds = Object.keys(statsMap);
  const titles = await repo.getContentTitles(contentIds);
  const titleMap = Object.fromEntries(titles.map((t) => [t.id, t.title]));

  const topAudiobooks: TopContentEntry[] = Object.entries(statsMap)
    .map(([contentId, s]) => ({ contentId, title: titleMap[contentId] ?? contentId, starts: s.starts, completions: s.completions, uniqueViewers: s.users.size }))
    .sort((a, b) => b.starts - a.starts)
    .slice(0, 10);

  return { totalStarts, uniqueListeners, completions, completionRate, averageProgress: Math.round(averageProgress * 10) / 10, topAudiobooks };
}

// ---------------------------------------------------------------------------
// Top content (cross-type)
// ---------------------------------------------------------------------------

export type ContentTypeFilter = "Movie" | "eBook" | "Audiobook" | "all";
export type MetricFilter = "starts" | "completions" | "uniqueUsers";

export interface TopContentRow {
  contentId: string;
  title: string;
  contentType: string;
  count: number;
}

export async function getTopContent(range: DateRange, contentType: ContentTypeFilter, metric: MetricFilter, limit: number): Promise<TopContentRow[]> {
  const includeMovies = contentType === "Movie" || contentType === "all";
  const includeEbooks = contentType === "eBook" || contentType === "all";
  const includeAudiobooks = contentType === "Audiobook" || contentType === "all";

  const [movieProgress, ebookProgress, audiobookProgress] = await Promise.all([
    includeMovies ? repo.getMovieProgressInRange(range.from, range.to) : Promise.resolve([]),
    includeEbooks ? repo.getEbookProgressInRange(range.from, range.to) : Promise.resolve([]),
    includeAudiobooks ? repo.getAudiobookProgressInRange(range.from, range.to) : Promise.resolve([]),
  ]);

  const statsMap: Record<string, { contentType: string; starts: number; completions: number; users: Set<string> }> = {};

  const addToMap = (id: string, type: string, p: { percentage: number; completed: boolean; userId: string }) => {
    if (!statsMap[id]) statsMap[id] = { contentType: type, starts: 0, completions: 0, users: new Set() };
    if (p.percentage > 0) statsMap[id]!.starts++;
    if (p.completed) statsMap[id]!.completions++;
    statsMap[id]!.users.add(p.userId);
  };

  for (const p of movieProgress) addToMap(p.movieId, "Movie", p);
  for (const p of ebookProgress) addToMap(p.ebookId, "eBook", p);
  for (const p of audiobookProgress) addToMap(p.audiobookId, "Audiobook", p);

  const contentIds = Object.keys(statsMap);
  const titles = await repo.getContentTitles(contentIds);
  const titleMap = Object.fromEntries(titles.map((t) => [t.id, t.title]));

  const getCount = (s: { starts: number; completions: number; users: Set<string> }) => {
    if (metric === "starts") return s.starts;
    if (metric === "completions") return s.completions;
    return s.users.size;
  };

  return Object.entries(statsMap)
    .map(([contentId, s]) => ({ contentId, title: titleMap[contentId] ?? contentId, contentType: s.contentType, count: getCount(s) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Top genres
// ---------------------------------------------------------------------------

export interface TopGenreEntry {
  genre: string;
  starts: number;
  uniqueUsers: number;
  contentCount: number;
}

export async function getTopGenres(range: DateRange, contentType: ContentTypeFilter): Promise<TopGenreEntry[]> {
  const includeMovies = contentType === "Movie" || contentType === "all";
  const includeEbooks = contentType === "eBook" || contentType === "all";
  const includeAudiobooks = contentType === "Audiobook" || contentType === "all";

  const [movieProgress, ebookProgress, audiobookProgress] = await Promise.all([
    includeMovies ? repo.getMovieProgressInRange(range.from, range.to) : Promise.resolve([]),
    includeEbooks ? repo.getEbookProgressInRange(range.from, range.to) : Promise.resolve([]),
    includeAudiobooks ? repo.getAudiobookProgressInRange(range.from, range.to) : Promise.resolve([]),
  ]);

  // Collect all unique content IDs that were started
  const startedContentIds = new Set<string>();
  const contentUserStarts: Record<string, { starts: number; users: Set<string> }> = {};

  const addContent = (id: string, p: { percentage: number; userId: string }) => {
    if (p.percentage > 0) {
      startedContentIds.add(id);
      if (!contentUserStarts[id]) contentUserStarts[id] = { starts: 0, users: new Set() };
      contentUserStarts[id]!.starts++;
      contentUserStarts[id]!.users.add(p.userId);
    }
  };

  for (const p of movieProgress) addContent(p.movieId, p);
  for (const p of ebookProgress) addContent(p.ebookId, p);
  for (const p of audiobookProgress) addContent(p.audiobookId, p);

  if (!startedContentIds.size) return [];

  // Get content with genres
  const contentWithGenres = await repo.getContentWithGenres([...startedContentIds]);

  const genreMap: Record<string, { starts: number; users: Set<string>; contentSet: Set<string> }> = {};

  for (const c of contentWithGenres) {
    const stats = contentUserStarts[c.id];
    if (!stats) continue;
    for (const cg of c.genres) {
      const genreName = cg.genre.name;
      if (!genreMap[genreName]) genreMap[genreName] = { starts: 0, users: new Set(), contentSet: new Set() };
      genreMap[genreName]!.starts += stats.starts;
      for (const u of stats.users) genreMap[genreName]!.users.add(u);
      genreMap[genreName]!.contentSet.add(c.id);
    }
  }

  return Object.entries(genreMap)
    .map(([genre, s]) => ({ genre, starts: s.starts, uniqueUsers: s.users.size, contentCount: s.contentSet.size }))
    .sort((a, b) => b.starts - a.starts);
}

// ---------------------------------------------------------------------------
// Per-title stats
// ---------------------------------------------------------------------------

export interface TitleStats {
  contentType: string;
  uniqueUsers: number;
  starts: number;
  completions: number;
  completionRate: number;
  myListAdds: number;
  averageProgress?: number;
  totalWatchTimeSecs?: number;
  totalListenTimeSecs?: number;
}

export async function getTitleStats(contentId: string, range: DateRange): Promise<TitleStats | null> {
  // Determine content type
  const [movieProgress, ebookProgress, audiobookProgress, myListAdds] = await Promise.all([
    repo.getMovieProgressInRange(range.from, range.to, contentId),
    repo.getEbookProgressInRange(range.from, range.to, contentId),
    repo.getAudiobookProgressInRange(range.from, range.to, contentId),
    repo.getMyListCountForContent(contentId),
  ]);

  const movieRows = movieProgress.filter((p) => p.movieId === contentId);
  const ebookRows = ebookProgress.filter((p) => p.ebookId === contentId);
  const audiobookRows = audiobookProgress.filter((p) => p.audiobookId === contentId);

  let contentType = "";
  let starts = 0;
  let completions = 0;
  let uniqueUsers = 0;
  let averageProgress: number | undefined;

  if (movieRows.length > 0) {
    contentType = "Movie";
    starts = movieRows.filter((p) => p.percentage > 0).length;
    completions = movieRows.filter((p) => p.completed).length;
    uniqueUsers = new Set(movieRows.filter((p) => p.percentage > 0).map((p) => p.userId)).size;
  } else if (ebookRows.length > 0) {
    contentType = "eBook";
    starts = ebookRows.filter((p) => p.percentage > 0).length;
    completions = ebookRows.filter((p) => p.completed).length;
    uniqueUsers = new Set(ebookRows.filter((p) => p.percentage > 0).map((p) => p.userId)).size;
    const started = ebookRows.filter((p) => p.percentage > 0);
    averageProgress = started.length > 0 ? started.reduce((s, p) => s + p.percentage, 0) / started.length : 0;
  } else if (audiobookRows.length > 0) {
    contentType = "Audiobook";
    starts = audiobookRows.filter((p) => p.percentage > 0).length;
    completions = audiobookRows.filter((p) => p.completed).length;
    uniqueUsers = new Set(audiobookRows.filter((p) => p.percentage > 0).map((p) => p.userId)).size;
  } else {
    // No progress found, still return zeros
    return { contentType: "Unknown", uniqueUsers: 0, starts: 0, completions: 0, completionRate: 0, myListAdds };
  }

  const completionRate = starts > 0 ? completions / starts : 0;
  const result: TitleStats = { contentType, uniqueUsers, starts, completions, completionRate, myListAdds };
  if (averageProgress !== undefined) result.averageProgress = Math.round(averageProgress * 10) / 10;

  return result;
}
