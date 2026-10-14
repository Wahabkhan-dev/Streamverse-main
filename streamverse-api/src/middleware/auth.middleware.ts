import jwt from "jsonwebtoken";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Role } from "../constants/roles";
import * as userRepository from "../repositories/user.repository";
import { verifyAccessToken } from "../services/token.service";
import { UnauthorizedError } from "../utils/errors";

export interface AuthContext {
  userId: string;
  role: Role;
}

const BEARER = /^Bearer (.+)$/;

/**
 * Authenticates the access token AND re-checks the account against the database on every request —
 * the token's `role` claim is never trusted by itself. This is what makes suspension take effect
 * immediately: an old, still-unexpired access token stops working the moment the account is suspended,
 * deleted, or no longer exists, because the lookup below fails the same way.
 */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  void (async () => {
    const header = req.get("authorization");
    const match = header ? BEARER.exec(header) : null;
    if (!match) throw new UnauthorizedError("Authentication required");

    let payload;
    try {
      payload = verifyAccessToken(match[1]!);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError("Access token expired");
      throw new UnauthorizedError("Invalid access token");
    }

    const user = await userRepository.findById(payload.sub);
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedError("Authentication required");

    req.auth = { userId: user.id, role: user.role };
  })().then(() => next(), next);
};

/**
 * Section 4: public discovery routes (browse, detail, search, homepage) work without a token, but
 * personalize access (subscription/age-restriction state) when one is sent. Never rejects — a missing,
 * expired or invalid token just means the request continues as anonymous, exactly like no header at all.
 */
export const optionalAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  void (async () => {
    const header = req.get("authorization");
    const match = header ? BEARER.exec(header) : null;
    if (!match) return;
    try {
      const payload = verifyAccessToken(match[1]!);
      const user = await userRepository.findById(payload.sub);
      if (user && user.status === "ACTIVE") req.auth = { userId: user.id, role: user.role };
    } catch {
      /* anonymous */
    }
  })().then(() => next(), next);
};
