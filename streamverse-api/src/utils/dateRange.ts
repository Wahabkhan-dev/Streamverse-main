import { ValidationError } from "./errors";

export type RangePreset = "7d" | "30d" | "90d" | "this_month" | "last_month" | "this_year";

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

const MAX_CUSTOM_DAYS = 365;

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function startOfYear(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), 0, 1));
}

function endOfYear(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), 11, 31));
}

/**
 * Resolves a date range from a preset or explicit from/to strings.
 * Validates: from <= to, max custom range 365 days.
 */
export function resolveRange(preset?: RangePreset, from?: string, to?: string): DateRange {
  const now = new Date();

  if (!preset && !from && !to) {
    // default: 30d
    return { from: daysAgo(30), to: endOfDay(now), label: "Last 30 days" };
  }

  if (from || to) {
    // custom range
    const f = from ? startOfDay(new Date(from)) : startOfDay(now);
    const t = to ? endOfDay(new Date(to)) : endOfDay(now);

    if (isNaN(f.getTime())) throw new ValidationError([{ path: "from", message: "Invalid date format for 'from'" }]);
    if (isNaN(t.getTime())) throw new ValidationError([{ path: "to", message: "Invalid date format for 'to'" }]);
    if (f > t) throw new ValidationError([{ path: "from", message: "'from' must be before or equal to 'to'" }]);

    const diffDays = (t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_CUSTOM_DAYS) {
      throw new ValidationError([{ path: "range", message: `Custom range cannot exceed ${MAX_CUSTOM_DAYS} days for daily grouping` }]);
    }

    return { from: f, to: t, label: `${from ?? "start"} to ${to ?? "now"}` };
  }

  switch (preset) {
    case "7d":
      return { from: daysAgo(7), to: endOfDay(now), label: "Last 7 days" };
    case "30d":
      return { from: daysAgo(30), to: endOfDay(now), label: "Last 30 days" };
    case "90d":
      return { from: daysAgo(90), to: endOfDay(now), label: "Last 90 days" };
    case "this_month":
      return { from: startOfMonth(now), to: endOfMonth(now), label: "This month" };
    case "last_month": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm), label: "Last month" };
    }
    case "this_year":
      return { from: startOfYear(now), to: endOfYear(now), label: "This year" };
    default:
      return { from: daysAgo(30), to: endOfDay(now), label: "Last 30 days" };
  }
}

/** Format a Date as YYYY-MM-DD */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Enumerate daily date keys between from and to (inclusive). */
export function dailyBuckets(from: Date, to: Date): string[] {
  const result: string[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  while (cur <= end) {
    result.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

/** Enumerate weekly date keys (Monday start) between from and to. */
export function weeklyBuckets(from: Date, to: Date): string[] {
  const result: string[] = [];
  const cur = new Date(from);
  // Align to Monday
  const day = cur.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  cur.setDate(cur.getDate() + offset);
  cur.setHours(0, 0, 0, 0);
  while (cur <= to) {
    result.push(formatDate(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return result;
}

/** Enumerate monthly date keys (YYYY-MM-01) between from and to. */
export function monthlyBuckets(from: Date, to: Date): string[] {
  const result: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to) {
    result.push(formatDate(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}
