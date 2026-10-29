// The service worker, served from a route so it carries this build's id: when a
// new version is deployed the bytes change, the browser installs it in the
// background and the game offers "Update" (see components/Pwa.tsx).
import { tileHosts } from "@/components/game/mapStyles";

const VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
// Every map style's tile provider (and NEXT_PUBLIC_TILE_URL's), so seen tiles work offline.
const TILE_HOSTS = tileHosts();

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
const STATIC = "sq-static-v2";   // hashed Next.js assets + images (v2: no videos)
const TILES = "sq-tiles-v1";     // map tiles you've seen, so the map works offline
const DATA = "sq-data-v1";       // last known game state, shown while offline
const MODELS = "sq-models-v1";   // stores' 3D buildings (immutable, hash in the address)
const ASSETS = "sq-assets-v1";   // fonts, the arena's 3D models, the 3D decoder: kept on the phone
const CITY = "sq-city-v1";       // 3D-city street maps (vector tiles + street detail) you've driven through
const MAX_MODELS = 40;
const MAX_CITY = 800;
const PRECACHE = ["/offline", "/play", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/badge-96.png", "/media/streetquest-ad.jpg"];
// Downloaded once, in the background, when the app is installed or opened — so the first
// drive, the first match and Persian text never wait on them over a slow phone connection.
const WARM = ["/fonts/Vazirmatn-UI-FD-Regular.woff2", "/fonts/Vazirmatn-UI-FD-Bold.woff2", "/fonts/Vazirmatn-UI-FD-Black.woff2", "/draco/draco_decoder.wasm", "/draco/draco_wasm_wrapper.js", "/models/arena/soldier.glb", "/models/arena/weapons.glb"];
// The map host the 3D city falls back to when our tile proxy can't be reached.
const VT_HOSTS = ["tiles.openfreemap.org"];
// Read-only game state that's useful to show offline.
const OFFLINE_DATA = /^\/api\/(me|world|hero|base|goals|gpsgame|outposts|leaderboard|notifications|store)(\?|$)/;
const MAX_TILES = 1500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})))));
  // Not part of install (a slow connection must not hold the update back); the page also
  // asks for it on every launch (Pwa.tsx), in case this got cut short.
  warm();
});
/** Fetch whatever of WARM the phone doesn't have yet (each one refreshes itself when used). */
async function warm() {
  const c = await caches.open(ASSETS);
  for (const u of WARM) {
    try {
      if (await c.match(u)) continue;
      const res = await fetch(u);
      if (res.ok) await c.put(u, res);
    } catch {}
  }
}

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith("sq-shell-") && k !== SHELL) || k === "sq-static-v1") await caches.delete(k);
    // Tiles from a provider no map style uses any more (CARTO began answering every tile
    // with an "API key required" picture): never shown again, so they go.
    const tiles = await caches.open(TILES);
    for (const r of await tiles.keys()) {
      const h = new URL(r.url).hostname;
      if (!TILE_HOSTS.some((t) => h === t || h.endsWith("." + t))) await tiles.delete(r);
    }
    // The 3D decoder used to share the store models' cache, where trimming could drop it.
    const models = await caches.open(MODELS);
    for (const r of await models.keys()) if (new URL(r.url).pathname.startsWith("/draco/")) await models.delete(r);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data && e.data.type === "VERSION") e.source && e.source.postMessage({ type: "VERSION", version: VERSION });
  if (e.data && e.data.type === "WARM") e.waitUntil(warm());
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
  const hit = await c.match(req, { ignoreVary: true });
  const net = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") c.put(req, res.clone()).then(() => name === TILES && trim(TILES, MAX_TILES));
    return res;
  }).catch(() => hit);
  if (hit) { event.waitUntil(net); return hit; }
  return net;
}
/**
 * Street maps change rarely: the phone's copy is used as it is for freshMs, and only
 * then asked for again (falling back to the old copy when the network is down).
 */
const DAY_MS = 86400000;
async function cityFirst(req, event, freshMs) {
  const c = await caches.open(CITY);
  const hit = await c.match(req, { ignoreVary: true });
  const at = hit ? Number(hit.headers.get("x-sq-at")) : 0;
  if (hit && Date.now() - at < freshMs) return hit;
  try {
    const res = await fetch(req);
    // 204 = no map there (sea, desert): worth remembering too.
    if (res.ok) {
      const body = await res.clone().arrayBuffer();
      const h = new Headers(res.headers);
      h.set("x-sq-at", String(Date.now()));
      event.waitUntil(c.put(req, new Response(res.status === 204 ? null : body, { status: res.status, headers: h })).then(() => trim(CITY, MAX_CITY)));
    }
    return res;
  } catch (err) {
    if (hit) return hit;
    throw err;
  }
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
    // Videos always go straight to the network: Safari only plays them from byte-range
    // (206) responses, which a cached copy can't provide.
    if (/\.(mp4|webm|mov|m4v)$/i.test(url.pathname) || req.destination === "video" || req.headers.get("range")) return;
    if (url.pathname.startsWith("/media/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/screens/")) return event.respondWith(cacheFirst(req, STATIC));
    if (url.pathname.startsWith("/landmark/")) return event.respondWith(cacheFirst(req, MODELS).then((res) => (event.waitUntil(trim(MODELS, MAX_MODELS)), res)));
    // Fonts, the arena's models, the 3D decoder: straight from the phone, refreshed behind.
    if (url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/models/") || url.pathname.startsWith("/draco/")) return event.respondWith(staleWhileRevalidate(req, ASSETS, event));
    // The 3D city's street maps (fetched by its worker, which this worker also serves).
    // Street detail (city packs) a day, since a city's pack can be rebuilt.
    if (url.pathname.startsWith("/api/vt/")) return event.respondWith(cityFirst(req, event, 7 * DAY_MS));
    if (url.pathname === "/api/city/detail") return event.respondWith(cityFirst(req, event, DAY_MS));
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
  if (VT_HOSTS.includes(url.hostname) && /\/\d+\/\d+\/\d+\.pbf$/.test(url.pathname)) return event.respondWith(cityFirst(req, event, 7 * DAY_MS));
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return event.respondWith(staleWhileRevalidate(req, STATIC, event));
});

// ---------------------------------------------------------------- push notifications
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: event.data && event.data.text() }; }
  const tag = d.tag || "sq";
  event.waitUntil((async () => {
    if (!d.always) {
      // The game is on screen: it shows the toast (or rings) by itself. Every push must
      // still show a notification — Safari/iOS revokes the subscription of a site that
      // receives pushes silently — so show a quiet one and take it straight down.
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.some((w) => w.visibilityState === "visible" && new URL(w.url).pathname.startsWith("/play"))) {
        await self.registration.showNotification(d.title || "StreetQuest", { body: d.body || "", tag, silent: true, icon: "/icons/icon-192.png" }).catch(() => {});
        (await self.registration.getNotifications({ tag })).forEach((n) => n.close());
        return;
      }
    }
    await self.registration.showNotification(d.title || "StreetQuest", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag,
      renotify: true,
      // An incoming call rings like one and stays until answered, declined or missed.
      vibrate: d.ring ? [600, 300, 600, 300, 600, 300, 600] : [80, 40, 80],
      requireInteraction: !!d.ring,
      actions: d.ring ? [{ action: "answer", title: (d.actions && d.actions.answer) || "📹 Answer" }, { action: "decline", title: (d.actions && d.actions.decline) || "Decline" }] : [],
      data: { url: d.url || "/play", call: d.call, ring: !!d.ring },
    }).catch(() =>
      // Some Android builds reject an option they don't know (badge, actions, vibrate):
      // never lose the notification over it.
      self.registration.showNotification(d.title || "StreetQuest", { body: d.body || "", icon: "/icons/icon-192.png", tag, data: { url: d.url || "/play", call: d.call, ring: !!d.ring } }),
    );
  })());
});

self.addEventListener("notificationclick", (event) => {
  const d = event.notification.data || {};
  event.notification.close();
  if (d.ring && d.call && event.action === "decline") {
    event.waitUntil(fetch("/api/calls", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "decline", callId: d.call }) }).catch(() => {}));
    return;
  }
  const answer = d.ring && event.action === "answer";
  const target = new URL(d.ring && d.call ? "/play?call=" + d.call + (answer ? "&answer=1" : "") : d.url || "/play", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).pathname.startsWith("/play")) {
        try { await w.focus(); } catch { continue; }
        // The open game picks the call up straight away (it would otherwise wait for its next poll).
        if (d.ring && d.call) w.postMessage({ type: "CALL", call: d.call, answer });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

// The browser replaced (or dropped) this device's subscription: subscribe again with the
// same server key and tell the server, or pushes would silently stop arriving.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const old = event.oldSubscription;
    const sub = event.newSubscription || (await self.registration.pushManager.subscribe(old ? old.options : { userVisibleOnly: true, applicationServerKey: await serverKey() }).catch(() => null));
    if (old && (!sub || old.endpoint !== sub.endpoint)) await post({ action: "unsubscribe", endpoint: old.endpoint });
    if (sub) await post({ action: "subscribe", sub: sub.toJSON() });
  })());
});
async function serverKey() {
  const { publicKey } = await fetch("/api/push", { credentials: "include" }).then((r) => r.json());
  const raw = atob((publicKey + "=".repeat((4 - (publicKey.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function post(body) {
  return fetch("/api/push", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}
`;
