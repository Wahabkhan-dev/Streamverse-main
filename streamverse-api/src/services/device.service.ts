import * as deviceRepository from "../repositories/device.repository";
import * as subscriptionRepository from "../repositories/subscription.repository";
import { ForbiddenError, NotFoundError } from "../utils/errors";

export async function registerDevice(
  userId: string,
  deviceIdentifier: string,
  data: { deviceName?: string; deviceType?: string; platform?: string },
) {
  const existing = await deviceRepository.findByUserIdAndIdentifier(userId, deviceIdentifier);
  if (existing && existing.status === "ACTIVE") {
    return deviceRepository.upsertDevice(userId, deviceIdentifier, data);
  }

  const subscription = await subscriptionRepository.findByUserId(userId);
  if (subscription?.plan?.maxDevices !== null && subscription?.plan?.maxDevices !== undefined) {
    const activeCount = await deviceRepository.countActive(userId);
    if (activeCount >= subscription.plan.maxDevices) {
      throw new ForbiddenError("DEVICE_LIMIT_REACHED");
    }
  }

  return deviceRepository.upsertDevice(userId, deviceIdentifier, data);
}

export async function listDevices(userId: string) {
  return deviceRepository.findActiveByUserId(userId);
}

export async function removeDevice(userId: string, deviceId: string) {
  const device = await deviceRepository.findByIdAndUserId(deviceId, userId);
  if (!device) throw new NotFoundError("Device not found");
  await deviceRepository.revokeDevice(deviceId, userId);
}
