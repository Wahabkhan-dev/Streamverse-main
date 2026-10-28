/* StreamVerse service worker.
 *
 * - Pages: network first. When the site cannot be reached (no internet, server down or blocked, a hung connection, or the
 *   server answering 502/503/504) the visitor gets the page as last seen on this device if there is one (that is how the
 *   Downloads screen and downloaded titles open offline), otherwise our own screen (offline.html), never the browser's.
 * - Built files (/assets/*, icons): cache first. The worker also saves the whole app (found by following the home page's
 *   files and the files they refer to), so the app starts with no network, including screens never opened before.
 * - /offline-media/*: titles saved for offline use, answered from the device (with byte ranges, so seeking works).
 * - Everything else (API calls, signed media links, other origins, dev module requests): untouched.
 */
const SHELL_CACHE = "sv-shell-v3";
const STATIC_CACHE = "sv-static-v3";
/* shared with the page code (src/lib/offline/files.ts), never deleted here */
const PAGES_CACHE = "sv-pages-v1";
const MEDIA_CACHE = "sv-media-v1";
const OFFLINE_URL = "/offline.html";
const OFFLINE_MEDIA = "/offline-media/";
/** A page that has not started answering by then is treated as unreachable (blocked networks often hang instead of failing). */
const PAGE_TIMEOUT_MS = 10_000;
/** The admin console and the content wizards are not needed to watch, read or listen offline. */
const SKIP_OFFLINE = /admin|wizard|medialibrary|mediapicker|livegenres|livebanners|contentpicker|uploadpanel/i;
const PRECACHE_EVERY_MS = 6 * 60 * 60 * 1000;
let lastPrecache = 0;

/** Saves the app's built files: start from the home page, then follow every file name found inside the files fetched. */
async function precacheApp() {
  lastPrecache = Date.now();
  const cache = await caches.open(STATIC_CACHE);
  const html = await (await fetch("/", { cache: "no-store" })).text();
  const seen = new Set();
  let queue = [];
  const want = (name) => {
    const url = name.startsWith("/") ? name : `/assets/${name.replace(/^\.?\/?(assets\/)?/, "")}`;
    if (!seen.has(url) && !SKIP_OFFLINE.test(url) && /\.(js|css)$/.test(url)) {
      seen.add(url);
      queue.push(url);
    }
  };
  for (const m of html.matchAll(/(\/assets\/[A-Za-z0-9_.\-]+\.(?:js|css))/g)) want(m[1]);
  while (queue.length) {
    const batch = queue.splice(0, 8);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          await cache.put(url, res.clone());
          if (url.endsWith(".js")) {
            const text = await res.text();
            for (const m of text.matchAll(/["'`](\.\/|\/assets\/|assets\/)([A-Za-z0-9_.\-]+\.(?:js|css))["'`]/g)) want(`${m[1]}${m[2]}`);
          }
        } catch {
          /* a file that cannot be saved now is saved the first time it is used */
        }
      }),
    );
  }
  // pages the app opens cold: kept now so the very first offline start works
  const pages = await caches.open(PAGES_CACHE);
  await Promise.all(["/", "/downloads"].map((p) => fetch(p).then((r) => (r.ok ? pages.put(p, r) : undefined)).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll([OFFLINE_URL, "/icons/icon-192.png"]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith("sv-shell-") || k.startsWith("sv-static-")) && k !== SHELL_CACHE && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      // saving the app is NOT part of activation (that would hold back every page request): the page asks for it afterwards
      .then(() => self.clients.claim()),
  );
});

/* the page asks for a refresh of the saved app once per visit (a new release has new file names) */
self.addEventListener("message", (event) => {
  if (event.data === "precache" && Date.now() - lastPrecache > PRECACHE_EVERY_MS) event.waitUntil(precacheApp().catch(() => undefined));
});

const isStatic = (url) => url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || url.pathname === "/favicon.png";

/** A saved title's file, with HTTP range support (audio and PDF seeking ask for byte ranges). */
async function serveSaved(request, url) {
  const res = await (await caches.open(MEDIA_CACHE)).match(url.pathname);
  if (!res) return new Response("Not saved on this device", { status: 404 });
  const range = request.headers.get("range");
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return res;
  const blob = await res.blob();
  const size = blob.size;
  const start = match[1] === "" ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = match[1] === "" || match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

/** The page from the network (and remembered), or the last copy seen here, or our offline screen. */
async function loadPage(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(request, { signal: controller.signal });
    if (res.status === 502 || res.status === 503 || res.status === 504) throw new Error("gateway");
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      const copy = res.clone();
      void caches.open(PAGES_CACHE).then((c) => c.put(request, copy));
    }
    return res;
  } catch {
    const seen = await caches.match(request, { cacheName: PAGES_CACHE, ignoreSearch: true });
    return seen ?? (await caches.match(OFFLINE_URL)) ?? Response.error();
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(OFFLINE_MEDIA)) {
    event.respondWith(serveSaved(request, url));
    return;
  }
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith(loadPage(request));
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(request, { ignoreSearch: true });
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) {
          const copy = res.clone();
          void caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })(),
    );
  }
});
