import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";

/**
 * Serialises plan-limit checks for one user. A limit check is "count, compare, insert"; without a lock two
 * simultaneous requests can both read count < limit and both insert. Every such check runs inside this
 * transaction, whose first statement is a row lock on the user (SELECT ... FOR UPDATE), so concurrent
 * requests for the SAME user queue up while different users never block each other.
 */
export const runLockedForUser = <T>(userId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
  prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${userId} FOR UPDATE`;
    return fn(tx);
  });
