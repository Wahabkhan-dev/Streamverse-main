import { env } from "../config/env";
import * as mediaAssetRepository from "../repositories/mediaAsset.repository";
import { getStorageProvider } from "./storage";

/**
 * The one place a stored object turns into a displayable, short-lived signed URL. Deliberately depends on nothing
 * but storage + the asset table so every service (catalog, collections, search, homepage, my-list...) can use it
 * without import cycles. Failures yield null (a missing image), never an error that breaks a whole list.
 */
export async function signStorageKey(storageKey: string | null | undefined): Promise<string | null> {
  if (!storageKey) return null;
  try {
    return await getStorageProvider().createDownloadUrl(storageKey, env.DOWNLOAD_URL_TTL_SECONDS);
  } catch {
    return null;
  }
}

/** Batched: one query for all asset ids, then parallel signing. Null/unknown assets map to null. */
export async function signAssetsById(assetIds: Array<string | null | undefined>): Promise<Map<string, string | null>> {
  const ids = [...new Set(assetIds.filter((id): id is string => !!id))];
  const result = new Map<string, string | null>();
  if (!ids.length) return result;
  const assets = await mediaAssetRepository.findManyByIds(ids);
  const keyById = new Map(assets.map((a) => [a.id, a.storageKey]));
  await Promise.all(ids.map(async (id) => result.set(id, await signStorageKey(keyById.get(id)))));
  return result;
}
