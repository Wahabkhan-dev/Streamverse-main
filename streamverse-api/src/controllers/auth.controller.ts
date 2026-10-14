import type { Request, Response } from "express";
import * as authService from "../services/auth.service";
import * as userService from "../services/user.service";
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from "../utils/authCookies";
import { sendSuccess } from "../utils/apiResponse";
import { UnauthorizedError } from "../utils/errors";

/** Controllers stay thin: read the (already validated) request, call the service, shape the response. */
function sendAuthResult(res: Response, result: Awaited<ReturnType<typeof authService.login>>, message: string, status = 200) {
  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
  sendSuccess(res, { user: result.user, accessToken: result.accessToken }, message, status);
}

export async function register(req: Request, res: Response) {
  const result = await authService.register(req.body, req);
  sendAuthResult(res, result, "Account created", 201);
}

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body, req);
  sendAuthResult(res, result, "Logged in");
}

export async function refresh(req: Request, res: Response) {
  const presented = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!presented) throw new UnauthorizedError("No session to refresh. Please log in again.");
  const result = await authService.refresh(presented, req);
  sendAuthResult(res, result, "Session refreshed");
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined, req);
  clearRefreshCookie(res);
  sendSuccess(res, null, "Logged out");
}

export async function logoutAll(req: Request, res: Response) {
  await authService.logoutAll(req.auth!.userId, req);
  clearRefreshCookie(res);
  sendSuccess(res, null, "Logged out of all devices");
}

export async function me(req: Request, res: Response) {
  const user = await userService.getProfile(req.auth!.userId);
  sendSuccess(res, user, "Current user");
}

export async function forgotPassword(req: Request, res: Response) {
  await authService.forgotPassword(req.body.email, req);
  sendSuccess(res, null, "If an account exists for that email, password reset instructions have been sent.");
}

export async function resetPassword(req: Request, res: Response) {
  await authService.resetPassword(req.body.token, req.body.newPassword, req);
  sendSuccess(res, null, "Your password has been reset. Please log in again.");
}

export async function changePassword(req: Request, res: Response) {
  await authService.changePassword(req.auth!.userId, req.body.currentPassword, req.body.newPassword, req);
  clearRefreshCookie(res);
  sendSuccess(res, null, "Your password has been changed. Please log in again.");
}
