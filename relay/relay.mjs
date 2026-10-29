// Relay for the Iranian store sites (Snappfood, Torob, Divar): run it on a server in Iran.
//
//   RELAY_KEY=<long random secret> node relay/relay.mjs        (PORT=8080)
//
// Snappfood refuses servers abroad (from Vercel it answers 403, so the map shows no
// restaurants and no menus), and it only allows its own sites to read it from a browser.
// The app asks this relay instead: SNAPPFOOD_URL=https://<relay>/<RELAY_KEY>/snappfood
// (and TOROB_URL / DIVAR_URL with /torob, /divar if those start refusing too).
//  - only the endpoints the game calls are forwarded (GET, and POST for Divar's ad
//    search); anything else, or a wrong key, is a 404 — it is not an open proxy;
//  - the app's User-Agent goes through, nothing else about the caller (no cookies, no
//    forwarded-for), and query strings (player positions) are never logged;
//  - the compressed body is piped straight back, and answers are marked no-store so a
//    CDN in front (ArvanCloud CDN for HTTPS) never caches them.
// No dependencies: any Node 18+ runs it (Ubuntu 24.04's apt package). relay/install.sh
// sets it up as a service. Env: PORT, RELAY_KEY (16+ characters), and SNAPPFOOD_ORIGIN /
// TOROB_ORIGIN / DIVAR_ORIGIN to point a site elsewhere (the tests use a local stub).
import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import https from "node:https";

const PORT = Number(process.env.PORT ?? 8080);
const KEY = process.env.RELAY_KEY ?? "";
const TIMEOUT_MS = 25_000;
/** Divar's ad search sends a small JSON filter; nothing the game posts is bigger. */
const MAX_BODY = 16 * 1024;

/** Each site and the endpoints the game calls on it (src/server/localData.ts). */
const SITES = {
  snappfood: {
    origin: process.env.SNAPPFOOD_ORIGIN || "https://snappfood.ir",
    get: ["/mobile/v3/restaurant/vendors-list", "/mobile/v2/restaurant/details/dynamic", "/mobile/v1/restaurant/vendor-comment", "/search/api/v1/desktop/search"],
    post: [],
  },
  torob: {
    origin: process.env.TOROB_ORIGIN || "https://api.torob.com",
    get: ["/v4/base-product/search/", "/v4/base-product/map/sellers/", "/v4/internet-shop/details/"],
    post: [],
  },
  divar: {
    origin: process.env.DIVAR_ORIGIN || "https://api.divar.ir",
    get: ["/v8/places/cities", /^\/v8\/places\/cities\/\d{1,9}\/districts$/],
    post: ["/v8/postlist/w/search"],
  },
};

const allowed = (list, path) => list.some((p) => (typeof p === "string" ? p === path : p.test(path)));
const keyOk = (key) => {
  const a = Buffer.from(key), b = Buffer.from(KEY);
  return a.length === b.length && timingSafeEqual(a, b);
};
const agents = { "https:": new https.Agent({ keepAlive: true, maxSockets: 8 }), "http:": new http.Agent({ keepAlive: true, maxSockets: 8 }) };

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/** The request body, or null when it's bigger than MAX_BODY. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.resume();
      } else parts.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url ?? "/", "http://relay");
  if (url.pathname === "/health") return send(res, 200, { ok: true, sites: Object.keys(SITES) });
  const [, key = "", name = "", ...rest] = url.pathname.split("/");
  const site = Object.hasOwn(SITES, name) ? SITES[name] : null;
  const path = `/${rest.join("/")}`;
  if (!keyOk(key) || !site || !(allowed(site.get, path) || allowed(site.post, path))) return send(res, 404, { error: "Not found" });
  const method = req.method === "POST" ? "POST" : "GET";
  if (req.method !== method || !allowed(method === "POST" ? site.post : site.get, path)) return send(res, 405, { error: "Method not allowed" });
  const body = method === "POST" ? await readBody(req) : null;
  if (method === "POST" && !body) return send(res, 413, { error: "Too large" });

  const target = new URL(site.origin + path + url.search);
  const headers = { "user-agent": req.headers["user-agent"] || "StreetQuest-relay", accept: req.headers.accept || "application/json" };
  if (req.headers["accept-encoding"]) headers["accept-encoding"] = req.headers["accept-encoding"];
  if (body) Object.assign(headers, { "content-type": req.headers["content-type"] || "application/json", "content-length": String(body.length) });
  const t0 = Date.now();
  res.on("finish", () => console.log(`${method} ${name}${path} ${res.statusCode} ${Date.now() - t0}ms`));
  const lib = target.protocol === "https:" ? https : http;
  const up = lib.request(target, { method, headers, agent: agents[target.protocol], timeout: TIMEOUT_MS }, (r) => {
    const out = { "cache-control": "no-store" };
    for (const h of ["content-type", "content-encoding", "content-length"]) if (r.headers[h]) out[h] = r.headers[h];
    res.writeHead(r.statusCode ?? 502, out);
    r.pipe(res);
  });
  up.on("timeout", () => up.destroy(new Error("timeout")));
  up.on("error", () => (res.headersSent ? res.destroy() : send(res, 502, { error: "Upstream unreachable" })));
  up.end(body ?? undefined);
}

if (KEY.length < 16) {
  console.error("Set RELAY_KEY to a secret of 16+ characters (openssl rand -hex 24).");
  process.exit(1);
}
const server = http.createServer((req, res) => {
  handle(req, res).catch(() => (res.headersSent ? res.destroy() : send(res, 500, { error: "Relay error" })));
});
server.listen(PORT, () => console.log(`relay listening on :${server.address().port}`));
