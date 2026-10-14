import type { Request, Response } from "express";
import * as userService from "../services/user.service";
import { sendSuccess } from "../utils/apiResponse";

export async function getProfile(req: Request, res: Response) {
  const user = await userService.getProfile(req.auth!.userId);
  sendSuccess(res, user, "Profile");
}

export async function updateProfile(req: Request, res: Response) {
  const user = await userService.updateProfile(req.auth!.userId, req.body);
  sendSuccess(res, user, "Profile updated");
}
