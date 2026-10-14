import type { Request, Response } from "express";
import * as deviceService from "../services/device.service";
import { sendSuccess } from "../utils/apiResponse";

export async function register(req: Request, res: Response) {
  const userId = req.auth!.userId;
  const device = await deviceService.registerDevice(userId, req.body.deviceIdentifier as string, {
    deviceName: req.body.deviceName as string | undefined,
    deviceType: req.body.deviceType as string | undefined,
    platform: req.body.platform as string | undefined,
  });
  sendSuccess(res, device);
}

export async function list(req: Request, res: Response) {
  const devices = await deviceService.listDevices(req.auth!.userId);
  sendSuccess(res, devices);
}

export async function remove(req: Request, res: Response) {
  await deviceService.removeDevice(req.auth!.userId, req.params["id"]!);
  sendSuccess(res, { message: "Device removed" });
}
