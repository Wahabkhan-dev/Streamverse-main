import { env } from "../../config/env";
import { createLocalStorageProvider } from "./local.storage.provider";
import { createS3StorageProvider } from "./s3.storage.provider";
import type { StorageProvider } from "./storage.provider";

export type { HeadResult, MultipartPart, PresignedUpload, StorageProvider } from "./storage.provider";

let instance: StorageProvider | undefined;

/** Section 2/3: the one place that reads `STORAGE_PROVIDER` — everything else depends on the interface. */
export function getStorageProvider(): StorageProvider {
  instance ??= env.STORAGE_PROVIDER === "local" ? createLocalStorageProvider() : createS3StorageProvider();
  return instance;
}
