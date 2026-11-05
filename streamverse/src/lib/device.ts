import { isApiError } from "@/api/client";
import { devicesApi } from "@/api/devices.api";

const KEY = "sv.deviceId";
let memoryId: string | null = null;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** A stable id for this browser. Kept in localStorage; if that is unavailable it lasts for the page's lifetime. */
export function thisDeviceId(): string {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) return saved;
    const id = newId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return (memoryId ??= newId());
  }
}

/** A name a person recognises in their list of devices, e.g. "Chrome on Windows". */
export function thisDeviceName(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

let registered: Promise<void> | null = null;

/**
 * Makes sure this browser counts as one of the customer's devices before something is played, read or listened to.
 * Over the plan's limit it throws the server's DEVICE_LIMIT_REACHED error (its message says what to do); any other failure
 * (offline, server busy) is ignored, because not being able to register must never stop a customer from watching.
 */
export function ensureDeviceRegistered(): Promise<void> {
  registered ??= devicesApi
    .register({ deviceIdentifier: thisDeviceId(), deviceName: thisDeviceName(), deviceType: "WEB", platform: "web" })
    .then(() => undefined)
    .catch((err: unknown) => {
      registered = null; // try again next time
      if (isApiError(err) && err.code === "DEVICE_LIMIT_REACHED") throw err;
    });
  return registered;
}

/** After a device is removed or the customer signs out, the next play registers again. */
export function forgetDeviceRegistration() {
  registered = null;
}
