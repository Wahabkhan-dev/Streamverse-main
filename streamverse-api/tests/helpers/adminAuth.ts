import request from "supertest";
import type { Express } from "express";

/** Registers a fresh user against the real auth flow, then promotes it to ADMIN directly in the fake DB. */
export async function createAdmin(app: Express, db: { user: { findUnique: (a: { where: { email: string } }) => Promise<{ id: string } | null>; update: (a: unknown) => Promise<unknown> } }) {
  const email = `admin-${Math.random().toString(36).slice(2)}@example.com`;
  await request(app).post("/api/v1/auth/register").send({ email, password: "a-strong-passphrase", fullName: "Admin Test" });
  const user = await db.user.findUnique({ where: { email } });
  await db.user.update({ where: { id: user!.id }, data: { role: "ADMIN" } });
  // the token issued at registration still says USER — log in again so the fresh token carries role ADMIN
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: "a-strong-passphrase" });
  return { accessToken: login.body.data.accessToken as string, userId: user!.id, email };
}

export async function createUser(app: Express) {
  const email = `user-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post("/api/v1/auth/register").send({ email, password: "a-strong-passphrase", fullName: "User Test" });
  return { accessToken: res.body.data.accessToken as string, email, userId: res.body.data.user.id as string };
}
