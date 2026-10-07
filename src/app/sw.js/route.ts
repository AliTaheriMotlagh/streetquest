// The service worker, served from a route so it carries this build's id: when a
// new version is deployed the bytes change, the browser installs it in the
// background and the game offers "Update" (see components/Pwa.tsx).
const VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
const TILE_HOSTS = ["tile.openstreetmap.org", ...(process.env.NEXT_PUBLIC_TILE_URL ? [new URL(process.env.NEXT_PUBLIC_TILE_URL.replace(/\{[a-z]\}/g, "a").replace(/\{[^}]+\}/g, "0")).hostname] : [])];

export const dynamic = "force-static";

export function GET() {
  return new Response(SW.replace("__VERSION__", VERSION).replace("__TILE_HOSTS__", JSON.stringify(TILE_HOSTS)), {
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache, no-store, must-revalidate", "service-worker-allowed": "/" },
  });
}

const SW = String.raw`
const VERSION = "__VERSION__";
const TILE_HOSTS = __TILE_HOSTS__;
const SHELL = "sq-shell-" + VERSION;
const STATIC = "sq-static-v1";   // hashed Next.js assets: safe forever
const TILES = "sq-tiles-v1";     // map tiles you've seen, so the map works offline
const DATA = "sq-data-v1";       // last known game state, shown while offline
const PRECACHE = ["/offline", "/play", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/badge-96.png", "/media/streetquest-ad.jpg"];
// Read-only game state that's useful to show offline.
const OFFLINE_DATA = /^\/api\/(me|world|hero|base|goals|gpsgame|outposts|leaderboard|notifications|store)(\?|$)/;
const MAX_TILES = 1500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("sq-shell-") && k !== SHELL) await caches.delete(k);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data && e.data.type === "VERSION") e.source && e.source.postMessage({ type: "VERSION", version: VERSION });
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}
async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") (await caches.open(name)).put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req, name, event) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") c.put(req, res.clone()).then(() => name === TILES && trim(TILES, MAX_TILES));
    return res;
  }).catch(() => hit);
  if (hit) { event.waitUntil(net); return hit; }
  return net;
}
function offlineJson() {
  return new Response(JSON.stringify({ error: "You're offline — this will work again when you're back online" }), { status: 503, headers: { "content-type": "application/json", "x-offline": "1" } });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") {
    // Actions need the server; answer clearly instead of a network error.
    if (new URL(req.url).pathname.startsWith("/api/")) event.respondWith(fetch(req).catch(offlineJson));
    return;
  }
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(req, STATIC));
    if (url.pathname.startsWith("/media/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/screens/")) {
      if (req.headers.get("range")) return; // let video range requests go straight to the network
      return event.respondWith(cacheFirst(req, STATIC));
    }
    if (url.pathname === "/sw.js") return;
    if (url.pathname.startsWith("/api/")) {
      if (OFFLINE_DATA.test(url.pathname + url.search)) {
        // Network first (live data), fall back to the last copy when offline.
        return event.respondWith((async () => {
          try {
            const res = await Promise.race([fetch(req), timeout(8000)]);
            if (res.ok) (await caches.open(DATA)).put(url.pathname, res.clone());
            return res;
          } catch {
            const hit = await (await caches.open(DATA)).match(url.pathname);
            if (!hit) return offlineJson();
            const h = new Headers(hit.headers); h.set("x-offline", "1");
            return new Response(hit.body, { status: 200, headers: h });
          }
        })());
      }
      return event.respondWith(fetch(req).catch(offlineJson));
    }
    if (req.mode === "navigate") {
      return event.respondWith((async () => {
        try {
          const pre = await event.preloadResponse;
          const res = pre || (await Promise.race([fetch(req), timeout(10000)]));
          if (res.ok && (url.pathname === "/play" || url.pathname === "/")) (await caches.open(SHELL)).put(url.pathname, res.clone());
          return res;
        } catch {
          const c = await caches.open(SHELL);
          return (await c.match(url.pathname)) || (url.pathname.startsWith("/play") ? await c.match("/play") : null) || (await c.match("/offline")) || offlineJson();
        }
      })());
    }
    return;
  }

  if (TILE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) return event.respondWith(staleWhileRevalidate(req, TILES, event));
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return event.respondWith(staleWhileRevalidate(req, STATIC, event));
});

// ---------------------------------------------------------------- push notifications
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || "StreetQuest", {
    body: d.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: d.tag || "sq",
    renotify: true,
    vibrate: [80, 40, 80],
    data: { url: d.url || "/play" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/play", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).pathname.startsWith("/play")) { await w.focus(); return; }
    }
    await self.clients.openWindow(target);
  })());
});
`;
