import * as deviceRepository from "../repositories/device.repository";
import * as subscriptionRepository from "../repositories/subscription.repository";
import { runLockedForUser } from "../repositories/userLock.repository";
import { ERROR_CODES } from "../constants/errors";
import { AppError, NotFoundError } from "../utils/errors";

export async function registerDevice(
  userId: string,
  deviceIdentifier: string,
  data: { deviceName?: string; deviceType?: string; platform?: string },
) {
  // The plan is read BEFORE taking the lock: reading it inside the transaction would need a second pooled
  // connection while this one is held, which can exhaust the pool when many requests for one user queue up.
  const subscription = await subscriptionRepository.findByUserId(userId);
  const maxDevices = subscription?.plan?.maxDevices;

  // check + insert under a per-user lock: two simultaneous registrations must not both pass the limit check
  return runLockedForUser(userId, async (tx) => {
    const existing = await deviceRepository.findByUserIdAndIdentifier(userId, deviceIdentifier, tx);
    if (existing && existing.status === "ACTIVE") {
      return deviceRepository.upsertDevice(userId, deviceIdentifier, data, tx);
    }

    if (maxDevices !== null && maxDevices !== undefined) {
      const activeCount = await deviceRepository.countActive(userId, tx);
      if (activeCount >= maxDevices) {
        throw new AppError("DEVICE_LIMIT_REACHED", 403, ERROR_CODES.DEVICE_LIMIT_REACHED);
      }
    }

    return deviceRepository.upsertDevice(userId, deviceIdentifier, data, tx);
  });
}

export async function listDevices(userId: string) {
  return deviceRepository.findActiveByUserId(userId);
}

export async function removeDevice(userId: string, deviceId: string) {
  const device = await deviceRepository.findByIdAndUserId(deviceId, userId);
  if (!device) throw new NotFoundError("Device not found");
  await deviceRepository.revokeDevice(deviceId, userId);
}
