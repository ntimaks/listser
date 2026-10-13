// Listser's service worker: opens the app instantly from the home screen, and
// with no connection at all. List data and queued changes live in IndexedDB
// (see src/lib/outbox.ts); this only keeps the files to start the app.
//
// - Build files (/_next/static, hashed) and icons: from the cache, else fetched
//   and kept.
// - The list page (/): the last copy at once, refreshed in the background for
//   next time. The page then loads fresh data itself.
// - Other pages: the network, falling back to the last copy when offline.
// - Everything else (data, sign-in, server actions): untouched.

const VERSION = "1";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;

const OFFLINE_PAGE = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LISTSER</title>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:14px ui-monospace,monospace;background:#EEEEEE;color:#0C0C0C">
<p style="padding:0 24px;text-align:center">// offline. this page wasn't saved for offline use.<br><br><a href="/" style="color:inherit">[BACK TO YOUR LISTS]</a></p>
</body>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC_CACHE, PAGE_CACHE];
      for (const key of await caches.keys()) {
        if (!keep.includes(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:svg|png|ico|webmanifest)$/.test(url.pathname)
  );
}

// Paths the worker leaves alone.
function isBypassed(url) {
  return /^\/(?:api|auth|login|oauth|\.well-known)(?:\/|$)/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || isBypassed(url)) return;
  if (isStatic(url)) {
    event.respondWith(fromCacheFirst(req));
  } else if (req.mode === "navigate") {
    event.respondWith(page(event, url));
  }
});

async function fromCacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Pages are kept by path: "/?list=…" is the same page as "/", which picks the
// list from the URL itself.
async function page(event, url) {
  const cache = await caches.open(PAGE_CACHE);
  const key = url.origin + url.pathname;
  const network = fetch(event.request).then((res) => {
    if (res.ok && res.type === "basic") {
      cache.put(key, res.clone());
    } else if (res.type === "opaqueredirect") {
      // Sent to sign in: the saved copy belongs to a session that's over.
      cache.delete(key);
    }
    return res;
  });

  if (url.pathname === "/") {
    const hit = await cache.match(key);
    if (hit) {
      event.waitUntil(network.catch(() => {}));
      return hit;
    }
  }
  try {
    return await network;
  } catch {
    const hit = await cache.match(key);
    return (
      hit ??
      new Response(OFFLINE_PAGE, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

// The page that registered us loaded before we were running, so it sends what
// it used: the build files and its own path. That makes the very next launch
// work offline, not the one after.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "warm") return;
  event.waitUntil(
    (async () => {
      const statics = await caches.open(STATIC_CACHE);
      const pages = await caches.open(PAGE_CACHE);
      await Promise.all(
        event.data.urls.map(async (href) => {
          const url = new URL(href, self.location.origin);
          if (url.origin !== self.location.origin || isBypassed(url)) return;
          try {
            if (isStatic(url)) {
              if (!(await statics.match(url))) await statics.add(url);
            } else if (url.pathname === "/" && !(await pages.match(url))) {
              const res = await fetch(url, { redirect: "manual" });
              if (res.ok && res.type === "basic") {
                await pages.put(url.origin + url.pathname, res);
              }
            }
          } catch {
            // Offline or gone: it'll be cached on its next use.
          }
        })
      );
    })()
  );
});
