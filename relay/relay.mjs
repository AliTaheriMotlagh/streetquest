// Relay for the Iranian sites (Snappfood, Torob, Divar, Takhfifan, Balad… and whatever the game needs
// next): run it on a server in Iran. Some sites refuse servers abroad (from Vercel Snappfood answers 403);
// the app asks this relay instead, and the relay asks the site from its Iranian address.
//
//   RELAY_KEY=<long random secret> node relay/relay.mjs        (PORT=8080)
//
// Two kinds of address, both behind the key (a wrong key is a 404 — it is not an open proxy):
//  - /<RELAY_KEY>/https/<host>/<path?query>   any public HTTPS site, any path: a new feature never
//    needs the relay redeployed (the app's RELAY_URL=http(s)://<relay>/<RELAY_KEY> builds these);
//  - /<RELAY_KEY>/<site>/<path?query>          the named sites below (SNAPPFOOD_URL=…/<RELAY_KEY>/snappfood
//    and the like keep working), any path on them.
// What goes through and what doesn't:
//  - GET, HEAD, POST, PUT, PATCH, DELETE; a body up to 1 MB;
//  - only the app's User-Agent, Accept*, Content-Type and Referer/Origin go to the site — never its
//    cookies, authorization or forwarded-for. A header the site needs (an API key, a cookie) is sent
//    as `x-relay-<name>`: the relay passes it on as `<name>`;
//  - never to a private, loopback or link-local address (checked after DNS, and the connection is
//    pinned to the address checked): other services on this server stay out of reach. RELAY_HOSTS
//    (comma-separated host suffixes, e.g. "snappfood.ir,torob.com") narrows the generic route;
//    unset or "*" allows any public host;
//  - the compressed body is piped straight back, cookies are dropped, answers are marked no-store
//    so a CDN in front (ArvanCloud CDN for HTTPS) never caches them; redirects are not followed;
//  - query strings (player positions) are never logged.
// No dependencies: any Node 18+ runs it (Ubuntu 24.04's apt package). relay/install.sh sets it up
// as a service. Env: PORT, RELAY_KEY (16+ characters), RELAY_HOSTS, and SNAPPFOOD_ORIGIN /
// TOROB_ORIGIN / DIVAR_ORIGIN / … to point a named site elsewhere (the tests use a local stub;
// RELAY_ALLOW_PRIVATE=1 lets the generic route reach it too — tests only).
import { timingSafeEqual } from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export const VERSION = 2;
const PORT = Number(process.env.PORT ?? 8080);
const KEY = process.env.RELAY_KEY ?? "";
const TIMEOUT_MS = 25_000;
const MAX_BODY = 1024 * 1024;
const ALLOW_PRIVATE = process.env.RELAY_ALLOW_PRIVATE === "1";
const HOSTS = (process.env.RELAY_HOSTS ?? "*").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

/** Named sites (short addresses the app has used since the first relay). Any path on them is forwarded. */
const SITES = {
  snappfood: process.env.SNAPPFOOD_ORIGIN || "https://snappfood.ir",
  torob: process.env.TOROB_ORIGIN || "https://api.torob.com",
  divar: process.env.DIVAR_ORIGIN || "https://api.divar.ir",
  takhfifan: process.env.TAKHFIFAN_ORIGIN || "https://takhfifan.com",
  balad: process.env.BALAD_ORIGIN || "https://search.raah.ir",
  baladpoi: process.env.BALAD_POI_ORIGIN || "https://poi.raah.ir",
  cinematicket: process.env.CINEMATICKET_ORIGIN || "https://cinematicket.org",
};

/** Request headers passed on as they are (everything else about the caller stays here). */
const PASS = ["user-agent", "accept", "accept-language", "accept-encoding", "content-type", "referer", "origin"];
/** Answer headers passed back. */
const BACK = ["content-type", "content-encoding", "content-length", "location", "etag", "last-modified", "retry-after", "content-disposition"];

const keyOk = (key) => {
  const a = Buffer.from(key), b = Buffer.from(KEY);
  return a.length === b.length && timingSafeEqual(a, b);
};
const agents = { "https:": new https.Agent({ keepAlive: true, maxSockets: 16 }), "http:": new http.Agent({ keepAlive: true, maxSockets: 16 }) };

/** A private, loopback, link-local, carrier-grade NAT, multicast or unspecified address. */
export function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return privateAddress(mapped[1]);
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
}

/** A host the generic route may ask: a plain DNS name (or IP) within RELAY_HOSTS. */
export function hostAllowed(host, hosts = HOSTS) {
  if (!/^[a-z0-9.-]{1,253}(?::\d{1,5})?$/i.test(host)) return false;
  const name = host.replace(/:\d+$/, "").toLowerCase();
  return hosts.includes("*") || hosts.some((h) => name === h || name.endsWith(`.${h}`));
}

/** Resolve once, refuse private addresses, and hand that same address to the connection. */
function pinnedLookup(hostname) {
  return new Promise((resolve, reject) => {
    if (net.isIP(hostname)) return ALLOW_PRIVATE || !privateAddress(hostname) ? resolve({ address: hostname, family: net.isIP(hostname) }) : reject(new Error("private"));
    dns.lookup(hostname, { all: true }, (err, list) => {
      if (err || !list?.length) return reject(err ?? new Error("no address"));
      if (!ALLOW_PRIVATE && list.some((a) => privateAddress(a.address))) return reject(new Error("private"));
      resolve(list[0]);
    });
  });
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/** The request body, or null when it's bigger than MAX_BODY. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0, over = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) over = true;
      else parts.push(c);
    });
    req.on("end", () => resolve(over ? null : Buffer.concat(parts)));
    req.on("error", reject);
  });
}

/** Where a relay address goes: the site's URL, or null (→ 404). */
export function targetOf(pathname, search, sites = SITES, hosts = HOSTS) {
  const [, key = "", name = "", ...rest] = pathname.split("/");
  if (!keyOk(key)) return null;
  if (name === "https" || (name === "http" && ALLOW_PRIVATE)) {
    const [host = "", ...path] = rest;
    if (!hostAllowed(host, hosts)) return null;
    return { url: new URL(`${name}://${host}/${path.join("/")}${search}`), label: host, named: false };
  }
  if (!Object.hasOwn(sites, name) || !rest.length) return null;
  return { url: new URL(`${sites[name].replace(/\/$/, "")}/${rest.join("/")}${search}`), label: name, named: true };
}

async function handle(req, res) {
  const url = new URL(req.url ?? "/", "http://relay");
  if (url.pathname === "/health") return send(res, 200, { ok: true, version: VERSION, sites: Object.keys(SITES), generic: true });
  const to = targetOf(url.pathname, url.search);
  if (!to) return send(res, 404, { error: "Not found" });
  const method = (req.method ?? "GET").toUpperCase();
  if (!METHODS.has(method)) return send(res, 405, { error: "Method not allowed" });
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await readBody(req) : null;
  if (hasBody && !body) return send(res, 413, { error: "Too large" });

  const headers = { "user-agent": "StreetQuest-relay", accept: "application/json" };
  for (const h of PASS) if (req.headers[h]) headers[h] = req.headers[h];
  for (const [h, v] of Object.entries(req.headers)) if (h.startsWith("x-relay-") && h.length > 8 && v) headers[h.slice(8)] = v;
  delete headers.host;
  if (body) headers["content-length"] = String(body.length);
  const t0 = Date.now();
  res.on("finish", () => console.log(`${method} ${to.label}${to.url.pathname} ${res.statusCode} ${Date.now() - t0}ms`));

  let addr;
  try {
    // Named sites are this server's own config; a generic host is checked after DNS.
    addr = to.named ? null : await pinnedLookup(to.url.hostname.replace(/^\[|\]$/g, ""));
  } catch (e) {
    return send(res, e?.message === "private" ? 403 : 502, { error: e?.message === "private" ? "Not a public address" : "Unknown host" });
  }
  const lib = to.url.protocol === "https:" ? https : http;
  const opts = { method, headers, agent: agents[to.url.protocol], timeout: TIMEOUT_MS, servername: net.isIP(to.url.hostname) ? undefined : to.url.hostname };
  if (addr) opts.lookup = (_h, o, cb) => (o?.all ? cb(null, [addr]) : cb(null, addr.address, addr.family));
  const up = lib.request(to.url, opts, (r) => {
    const out = { "cache-control": "no-store" };
    for (const h of BACK) if (r.headers[h]) out[h] = r.headers[h];
    res.writeHead(r.statusCode ?? 502, out);
    r.pipe(res);
  });
  up.on("timeout", () => up.destroy(new Error("timeout")));
  up.on("error", () => (res.headersSent ? res.destroy() : send(res, 502, { error: "Upstream unreachable" })));
  up.end(body ?? undefined);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (KEY.length < 16) {
    console.error("Set RELAY_KEY to a secret of 16+ characters (openssl rand -hex 24).");
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => (res.headersSent ? res.destroy() : send(res, 500, { error: "Relay error" })));
  });
  server.listen(PORT, () => console.log(`relay v${VERSION} listening on :${server.address().port}`));
}
