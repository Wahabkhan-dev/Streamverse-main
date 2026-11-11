import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { prisma } from "../config/database";
import * as subscriptionRepository from "../repositories/subscription.repository";
import { listMyPayments } from "../services/billing/payment.service";
import { listHistory } from "../services/history.service";
import { listLibrary } from "../services/library.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";
import { AppError, NotFoundError } from "../utils/errors";

const BadRequestError = (msg: string) => new AppError(msg, 400, "BAD_REQUEST" as never);
import { buildPagination, toSkipTake } from "../utils/pagination";

function serialize(u: {
  id: string; email: string; fullName: string; role: string; status: string;
  country: string | null; createdAt: Date; lastLoginAt: Date | null;
  subscription?: { status: string } | null;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.fullName,
    role: u.role.toLowerCase() as "user" | "admin",
    subscriptionStatus: u.subscription?.status ?? null,
    country: u.country,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    active: u.status === "ACTIVE",
  };
}

const WITH_SUB = { subscription: { select: { status: true } } } as const;

/** Sort orders the Users page can ask for; the id tiebreak keeps paging stable when values repeat. */
const USER_SORTS = {
  newest: [{ createdAt: "desc" }, { id: "desc" }],
  oldest: [{ createdAt: "asc" }, { id: "asc" }],
  name: [{ fullName: "asc" }, { id: "asc" }],
  email: [{ email: "asc" }, { id: "asc" }],
  lastLogin: [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
} satisfies Record<string, Prisma.UserOrderByWithRelationInput[]>;

export async function list(req: Request, res: Response) {
  const { page, limit, search, role, status, sort } = req.query as {
    page?: string; limit?: string; search?: string; role?: string; status?: string; sort?: keyof typeof USER_SORTS;
  };
  const p = Number(page ?? 1);
  const l = Number(limit ?? 20);
  const { skip, take } = toSkipTake(p, l);

  const where = {
    deletedAt: null,
    ...(search ? { OR: [{ email: { contains: search } }, { fullName: { contains: search } }] } : {}),
    ...(role ? { role: role as "USER" | "ADMIN" } : {}),
    ...(status ? { status: status as "ACTIVE" | "SUSPENDED" | "DELETED" } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take, orderBy: USER_SORTS[sort ?? "newest"] ?? USER_SORTS.newest, include: WITH_SUB }),
    prisma.user.count({ where }),
  ]);

  sendPaginated(res, users.map(serialize), buildPagination(total, p, l));
}

export async function getOne(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.params["id"]! }, include: WITH_SUB });
  if (!user || user.deletedAt) throw new NotFoundError("User not found");
  sendSuccess(res, serialize(user), "User");
}

/** The admin's view of one customer: their real subscription, billing, library and viewing history (nothing generated). */
export async function activity(req: Request, res: Response) {
  const id = req.params["id"]!;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.deletedAt) throw new NotFoundError("User not found");
  const [sub, payments, library, history] = await Promise.all([subscriptionRepository.findByUserId(id), listMyPayments(id, 1, 10), listLibrary(id), listHistory(id, {}, 1, 10)]);
  sendSuccess(
    res,
    {
      subscription: sub
        ? {
            status: sub.status,
            plan: sub.plan ? { id: sub.plan.id, name: sub.plan.name, priceAmount: sub.plan.priceAmount, currency: sub.plan.currency, billingInterval: sub.plan.billingInterval } : null,
            currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
      payments: payments.rows,
      library: library.slice(0, 10).map((c) => ({ id: c.id, title: c.title, type: c.type, at: c.addedAt })),
      history: history.rows.map((c) => ({ id: c.id, title: c.title, type: c.type, activityType: c.activityType, at: c.lastAccessedAt })),
    },
    "User activity",
  );
}

export async function update(req: Request, res: Response) {
  const { fullName, role } = req.body as { fullName?: string; role?: "USER" | "ADMIN" };
  const user = await prisma.user.findUnique({ where: { id: req.params["id"]! } });
  if (!user || user.deletedAt) throw new NotFoundError("User not found");
  if (role && user.id === req.auth?.userId) throw BadRequestError("Admins cannot change their own role");

  const updated = await prisma.user.update({
    where: { id: req.params["id"]! },
    data: { ...(fullName ? { fullName } : {}), ...(role ? { role } : {}) },
    include: WITH_SUB,
  });
  sendSuccess(res, serialize(updated), "User");
}

export async function suspend(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.params["id"]! } });
  if (!user || user.deletedAt) throw new NotFoundError("User not found");
  if (user.id === req.auth?.userId) throw BadRequestError("You cannot suspend your own account");
  await prisma.user.update({ where: { id: req.params["id"]! }, data: { status: "SUSPENDED" } });
  sendSuccess(res, { message: "User suspended" }, "User");
}

export async function unsuspend(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.params["id"]! } });
  if (!user || user.deletedAt) throw new NotFoundError("User not found");
  await prisma.user.update({ where: { id: req.params["id"]! }, data: { status: "ACTIVE" } });
  sendSuccess(res, { message: "User unsuspended" }, "User");
}

export async function remove(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.params["id"]! } });
  if (!user || user.deletedAt) throw new NotFoundError("User not found");
  if (user.id === req.auth?.userId) throw BadRequestError("You cannot delete your own account");
  await prisma.user.update({ where: { id: req.params["id"]! }, data: { status: "DELETED", deletedAt: new Date() } });
  sendSuccess(res, { message: "User deleted" }, "User");
}
