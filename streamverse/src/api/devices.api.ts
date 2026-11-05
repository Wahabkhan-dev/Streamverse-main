import { api } from "./client";
import type { ApiDevice, ApiResponse } from "./types";

/** The devices a customer is signed in on, which the plan's device limit counts (see Subscription → Your devices). */
export const devicesApi = {
  list() {
    return api.get<ApiResponse<ApiDevice[]>>("/me/devices");
  },
  /** Registers (or refreshes) one device. Over the plan's limit this fails with DEVICE_LIMIT_REACHED and a message to show. */
  register(device: { deviceIdentifier: string; deviceName?: string; deviceType?: string; platform?: string }) {
    return api.post<ApiResponse<ApiDevice>>("/me/devices", device);
  },
  remove(id: string) {
    return api.delete<ApiResponse<{ message: string }>>(`/me/devices/${id}`);
  },
};
