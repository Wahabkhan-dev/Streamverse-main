/**
 * The device-side copy of a download lives in the browser's Cache Storage, under addresses on THIS site
 * (`/offline-media/<contentId>/<file>`). The service worker answers requests for those addresses straight from the cache
 * (with byte-range support, so seeking works), which is why the players need no special offline code: they just get a
 * local URL instead of a signed one.
 */
export const MEDIA_CACHE = "sv-media-v1";
export const PAGES_CACHE = "sv-pages-v1";

export const OFFLINE_PREFIX = "/offline-media/";
export const offlineUrl = (contentId: string, name: string) => `${OFFLINE_PREFIX}${contentId}/${name}`;

export const cacheSupported = () => typeof caches !== "undefined";

export async function hasFile(contentId: string, name: string): Promise<boolean> {
  if (!cacheSupported()) return false;
  return !!(await (await caches.open(MEDIA_CACHE)).match(offlineUrl(contentId, name)));
}

/** Streams a response into the cache while counting the bytes, without holding the whole file in memory. */
export async function storeResponse(contentId: string, name: string, res: Response, mime: string, onBytes: (n: number) => void): Promise<number> {
  const cache = await caches.open(MEDIA_CACHE);
  if (!res.body) {
    const blob = await res.blob();
    await cache.put(offlineUrl(contentId, name), new Response(blob, { headers: { "Content-Type": mime } }));
    onBytes(blob.size);
    return blob.size;
  }
  const [forCache, forCount] = res.body.tee();
  const headers: Record<string, string> = { "Content-Type": mime };
  const length = res.headers.get("Content-Length");
  if (length) headers["Content-Length"] = length;
  const stored = cache.put(offlineUrl(contentId, name), new Response(forCache, { headers }));
  let total = 0;
  const reader = forCount.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    onBytes(value.byteLength);
  }
  await stored;
  return total;
}

export async function storeText(contentId: string, name: string, text: string, mime: string): Promise<void> {
  await (await caches.open(MEDIA_CACHE)).put(offlineUrl(contentId, name), new Response(text, { headers: { "Content-Type": mime } }));
}

export async function storeBlob(contentId: string, name: string, blob: Blob): Promise<void> {
  await (await caches.open(MEDIA_CACHE)).put(offlineUrl(contentId, name), new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream" } }));
}

/** Removes every stored file of one title. */
export async function removeFiles(contentId: string): Promise<void> {
  if (!cacheSupported()) return;
  const cache = await caches.open(MEDIA_CACHE);
  const prefix = offlineUrl(contentId, "");
  for (const req of await cache.keys()) if (new URL(req.url).pathname.startsWith(prefix)) await cache.delete(req);
}

export async function removeAllFiles(): Promise<void> {
  if (cacheSupported()) await caches.delete(MEDIA_CACHE);
}

/** The pages an offline visit needs (the Downloads screen and the title's own pages), kept so they open without a network. */
export async function keepPages(paths: string[]): Promise<void> {
  if (!cacheSupported()) return;
  const cache = await caches.open(PAGES_CACHE);
  await Promise.all(
    paths.map(async (p) => {
      try {
        const res = await fetch(p, { headers: { Accept: "text/html" } });
        if (res.ok) await cache.put(p, res);
      } catch {
        /* a page that cannot be kept now is simply not available offline */
      }
    }),
  );
}

export async function removePages(paths: string[]): Promise<void> {
  if (!cacheSupported()) return;
  const cache = await caches.open(PAGES_CACHE);
  await Promise.all(paths.map((p) => cache.delete(p)));
}

/** How much the browser says this site stores, for the Downloads screen. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
