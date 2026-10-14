/**
 * Analytics repository — all Prisma queries for the Phase 9 analytics feature.
 * Uses JS-side aggregation via findMany (rather than Prisma groupBy / raw SQL) so the
 * fakePrisma test double can exercise the same code path without a real database.
 */
import { prisma } from "../config/database";

// ---------------------------------------------------------------------------
// Dashboard summary helpers
// ---------------------------------------------------------------------------

export async function getContentCounts() {
  const [movies, ebooks, audiobooks, byStatus, failedMedia] = await Promise.all([
    prisma.content.count({ where: { type: "MOVIE", deletedAt: null } }),
    prisma.content.count({ where: { type: "EBOOK", deletedAt: null } }),
    prisma.content.count({ where: { type: "AUDIOBOOK", deletedAt: null } }),
    prisma.content.findMany({ where: { deletedAt: null }, select: { status: true } }),
    prisma.mediaAsset.count({ where: { status: "FAILED", deletedAt: null } }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const row of byStatus) statusMap[row.status] = (statusMap[row.status] ?? 0) + 1;

  return {
    totalMovies: movies,
    totalEbooks: ebooks,
    totalAudiobooks: audiobooks,
    publishedContent: statusMap["PUBLISHED"] ?? 0,
    draftContent: statusMap["DRAFT"] ?? 0,
    scheduledContent: statusMap["SCHEDULED"] ?? 0,
    archivedContent: statusMap["ARCHIVED"] ?? 0,
    processingContent: statusMap["PROCESSING"] ?? 0,
    failedMedia,
  };
}

export async function getUserCounts() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [total, newThisMonth] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, createdAt: { gte: firstOfMonth } } }),
  ]);
  return { totalUsers: total, newUsersThisMonth: newThisMonth };
}

export async function getSubscriptionCounts() {
  const rows = await prisma.subscription.findMany({ select: { status: true } });
  const statusMap: Record<string, number> = {};
  for (const r of rows) statusMap[r.status] = (statusMap[r.status] ?? 0) + 1;
  return {
    activeSubscriptions: statusMap["ACTIVE"] ?? 0,
    trialingSubscriptions: statusMap["TRIALING"] ?? 0,
    pastDueSubscriptions: statusMap["PAST_DUE"] ?? 0,
  };
}

export async function getRevenueSummary() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [allPayments, monthPayments, allRefunds] = await Promise.all([
    prisma.payment.findMany({ where: { status: "SUCCEEDED" }, select: { amount: true } }),
    prisma.payment.findMany({ where: { status: "SUCCEEDED", paidAt: { gte: firstOfMonth } }, select: { amount: true } }),
    prisma.refund.findMany({ where: { status: "SUCCEEDED" }, select: { amount: true } }),
  ]);

  const totalRevenueCents = allPayments.reduce((s, p) => s + p.amount, 0);
  const revenueThisMonth = monthPayments.reduce((s, p) => s + p.amount, 0);
  const refundedCents = allRefunds.reduce((s, r) => s + r.amount, 0);

  return { totalRevenueCents: totalRevenueCents - refundedCents, revenueThisMonth };
}

export async function getMediaAssetStatusCounts() {
  const rows = await prisma.mediaAsset.findMany({ where: { deletedAt: null }, select: { status: true } });
  const statusMap: Record<string, number> = {};
  for (const r of rows) statusMap[r.status] = (statusMap[r.status] ?? 0) + 1;
  return {
    processing: statusMap["PROCESSING"] ?? 0,
    failed: statusMap["FAILED"] ?? 0,
    ready: statusMap["READY"] ?? 0,
  };
}

export async function getFailedPaymentsLast24h() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: since } } });
}

// ---------------------------------------------------------------------------
// Recent content / users
// ---------------------------------------------------------------------------

export async function getRecentContent(limit: number) {
  return prisma.content.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, title: true, status: true, createdAt: true, contentCode: true },
  });
}

export async function getRecentUsers(limit: number) {
  return prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, email: true, fullName: true, role: true, createdAt: true, subscription: { select: { status: true } } },
  });
}

// ---------------------------------------------------------------------------
// User growth analytics
// ---------------------------------------------------------------------------

export async function getUsersCreatedInRange(from: Date, to: Date) {
  return prisma.user.findMany({
    where: { deletedAt: null, createdAt: { gte: from, lte: to } },
    select: { id: true, createdAt: true },
  });
}

export async function getTotalUsersAsOf(date: Date) {
  return prisma.user.count({ where: { deletedAt: null, createdAt: { lte: date } } });
}

export async function getActiveUsersInRange(from: Date, to: Date) {
  // "active" = has at least 1 progress record updated in the period
  const [m, e, a] = await Promise.all([
    prisma.movieProgress.findMany({ where: { updatedAt: { gte: from, lte: to } }, select: { userId: true } }),
    prisma.ebookProgress.findMany({ where: { updatedAt: { gte: from, lte: to } }, select: { userId: true } }),
    prisma.audiobookProgress.findMany({ where: { updatedAt: { gte: from, lte: to } }, select: { userId: true } }),
  ]);
  const ids = new Set([...m, ...e, ...a].map((r) => r.userId));
  return ids.size;
}

// ---------------------------------------------------------------------------
// Subscription analytics
// ---------------------------------------------------------------------------

export async function getAllSubscriptionsWithPlan() {
  // Use include (not select) so the fakePrisma relation resolver can populate `plan`
  const rows = await prisma.subscription.findMany({ include: { plan: true } });
  return rows.map((r) => ({ status: r.status, planId: r.planId, plan: r.plan as { name: string }, createdAt: r.createdAt, updatedAt: r.updatedAt, canceledAt: (r as unknown as { canceledAt?: Date | string | null }).canceledAt ?? null }));
}

// ---------------------------------------------------------------------------
// Revenue analytics
// ---------------------------------------------------------------------------

export async function getPaymentsInRange(from: Date, to: Date) {
  return prisma.payment.findMany({
    where: { status: "SUCCEEDED", paidAt: { gte: from, lte: to } },
    select: { amount: true, currency: true, paidAt: true, createdAt: true },
  });
}

export async function getRefundsInRange(from: Date, to: Date) {
  return prisma.refund.findMany({
    where: { status: "SUCCEEDED", createdAt: { gte: from, lte: to } },
    select: { amount: true, currency: true, createdAt: true },
  });
}

export async function getFailedPaymentsInRange(from: Date, to: Date) {
  return prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: from, lte: to } } });
}

export async function getSucceededPaymentsCount(from: Date, to: Date) {
  return prisma.payment.count({ where: { status: "SUCCEEDED", paidAt: { gte: from, lte: to } } });
}

// ---------------------------------------------------------------------------
// Movie analytics
// ---------------------------------------------------------------------------

export async function getMovieProgressInRange(from: Date, to: Date, contentId?: string) {
  return prisma.movieProgress.findMany({
    where: {
      updatedAt: { gte: from, lte: to },
      ...(contentId ? { movieId: contentId } : {}),
    },
    select: { userId: true, movieId: true, completed: true, percentage: true },
  });
}

// ---------------------------------------------------------------------------
// eBook analytics
// ---------------------------------------------------------------------------

export async function getEbookProgressInRange(from: Date, to: Date, contentId?: string) {
  return prisma.ebookProgress.findMany({
    where: {
      updatedAt: { gte: from, lte: to },
      ...(contentId ? { ebookId: contentId } : {}),
    },
    select: { userId: true, ebookId: true, completed: true, percentage: true },
  });
}

// ---------------------------------------------------------------------------
// Audiobook analytics
// ---------------------------------------------------------------------------

export async function getAudiobookProgressInRange(from: Date, to: Date, contentId?: string) {
  return prisma.audiobookProgress.findMany({
    where: {
      updatedAt: { gte: from, lte: to },
      ...(contentId ? { audiobookId: contentId } : {}),
    },
    select: { userId: true, audiobookId: true, completed: true, percentage: true },
  });
}

// ---------------------------------------------------------------------------
// Top content helpers
// ---------------------------------------------------------------------------

export async function getContentTitles(contentIds: string[]) {
  if (!contentIds.length) return [] as { id: string; title: string; type: string }[];
  return prisma.content.findMany({
    where: { id: { in: contentIds }, deletedAt: null },
    select: { id: true, title: true, type: true },
  });
}

export async function getContentWithGenres(contentIds: string[]) {
  if (!contentIds.length) return [] as { id: string; title: string; type: string; genres: { genre: { name: string } }[] }[];
  return prisma.content.findMany({
    where: { id: { in: contentIds }, deletedAt: null },
    select: { id: true, title: true, type: true, genres: { include: { genre: true } } },
  });
}

// ---------------------------------------------------------------------------
// Per-title stats
// ---------------------------------------------------------------------------

export async function getMyListCountForContent(contentId: string) {
  return prisma.userSavedContent.count({ where: { contentId } });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditLogFilters {
  actor?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export async function listAuditLogs(filters: AuditLogFilters, skip: number, take: number) {
  const where: Record<string, unknown> = {};
  if (filters.actor) where["userId"] = filters.actor;
  if (filters.action) where["action"] = filters.action;
  if (filters.entityType) where["entityType"] = filters.entityType;
  if (filters.entityId) where["entityId"] = filters.entityId;
  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Record<string, unknown> = {};
    if (filters.dateFrom) createdAt["gte"] = filters.dateFrom;
    if (filters.dateTo) createdAt["lte"] = filters.dateTo;
    where["createdAt"] = createdAt;
  }
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, total };
}

export async function getAuditLogById(id: string) {
  return prisma.auditLog.findUnique({ where: { id } });
}
