// The Iran front door: the whole game at an address inside Iran, for players whose internet can't reach
// Cloudflare (mobile operators throttle or cut its addresses on and off — then the game "needs a VPN").
// It runs on the relay box in Iran and passes every request on to the real site (ORIGIN, on Cloudflare)
// over the datacenter's own international link, which stays up when home and mobile lines don't.
//
//   FRONT_KEY=<secret> TLS_CERT=… TLS_KEY=… node front/front.mjs     (front/install.sh sets it up)
//
//  - HTTPS (+ HTTP/2, many small files over a slow line) on PORT (8443) with the box's sslip.io
//    certificate — the one the realtime server already has; it's re-read when renewed;
//  - the game's build files (/_next/static, immutable 3D models…) are kept on disk (CACHE_DIR, at most
//    CACHE_MB): after the first player, they load from Iran and never cross the border again;
//  - the player's address goes to the app as x-front-ip, with FRONT_KEY in x-front-key (the app trusts
//    it only with that key: lib/clientIp.ts) — otherwise every player would look like this one server;
//  - redirects and cookies are rewritten to this address; Cloudflare's own headers (Alt-Svc would send
//    browsers to port 443 here — another app's —, HSTS, NEL) are dropped; marked noindex (search engines
//    keep the real domain);
//  - query strings (player positions) are never logged. No dependencies: any Node 18+.
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream";
import zlib from "node:zlib";

export const VERSION = 1;
const PORT = Number(process.env.PORT ?? 8443);
const ORIGIN = (process.env.ORIGIN ?? "https://streetquest.remixt.app").replace(/\/$/, "");
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN ?? "").replace(/\/$/, "");
const KEY = process.env.FRONT_KEY ?? "";
const CACHE_DIR = process.env.CACHE_DIR ?? "";
const CACHE_MAX = Number(process.env.CACHE_MB ?? 1024) * 1024 * 1024;
const TIMEOUT_MS = 60_000;

/** Never passed on, either way (connection-level, or HTTP/2 pseudo-headers). */
const HOP = new Set(["connection", "keep-alive", "proxy-connection", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "http2-settings", "host"]);
/** Request headers a player could forge to look like someone else — the front door says who they are. */
const FORGED = /^(x-front-|x-forwarded-|x-real-ip$|cf-|cdn-loop$|true-client-ip$)/;
/** Answer headers that only make sense for Cloudflare's own address. */
const CF_ONLY = new Set(["alt-svc", "strict-transport-security", "nel", "report-to", "cf-ray", "cf-cache-status", "server"]);

/** The headers that go to the site. Pure. */
export function upstreamHeaders(inHeaders, { origin, publicOrigin, key, ip }) {
  const out = {};
  for (const [k, v] of Object.entries(inHeaders)) {
    if (v == null || k.startsWith(":") || HOP.has(k) || FORGED.test(k)) continue;
    out[k] = v;
  }
  // The site checks nothing about where a form came from, but keep Origin/Referer its own anyway.
  for (const h of ["origin", "referer"]) if (typeof out[h] === "string" && publicOrigin && out[h].startsWith(publicOrigin)) out[h] = origin + out[h].slice(publicOrigin.length);
  out.host = new URL(origin).host;
  out["x-forwarded-proto"] = "https";
  if (key) {
    out["x-front-key"] = key;
    out["x-front-ip"] = ip;
  }
  return out;
}

/** The headers that go back to the player. Pure. */
export function downstreamHeaders(upHeaders, { origin, publicOrigin }) {
  const out = {};
  for (const [k, v] of Object.entries(upHeaders)) {
    if (v == null || HOP.has(k) || CF_ONLY.has(k)) continue;
    out[k] = v;
  }
  if (typeof out.location === "string" && publicOrigin && out.location.startsWith(origin)) out.location = publicOrigin + out.location.slice(origin.length);
  if (out["set-cookie"]) out["set-cookie"] = [].concat(out["set-cookie"]).map((c) => c.replace(/;\s*domain=[^;]*/gi, ""));
  out["x-robots-tag"] = "noindex";
  return out;
}

/** Kept on disk: a successful, public, never-changing answer (build files, immutable models). Pure. */
export function cacheable(method, pathname, status, headers) {
  if (method !== "GET" || status !== 200 || headers["set-cookie"] || headers.vary?.includes("*")) return false;
  const cc = String(headers["cache-control"] ?? "");
  if (/no-store|private/.test(cc)) return false;
  return pathname.startsWith("/_next/static/") || /\bimmutable\b/.test(cc);
}

/** Asked of the site for a file that may be kept: always gzip, so one copy suits every browser. Pure. */
export const askCacheable = (method, pathname) => method === "GET" && !pathname.startsWith("/api/");

// ---------------------------------------------------------------- the disk cache
const cache = {
  size: 0,
  file: (key) => path.join(CACHE_DIR, key),
  key: (url) => createHash("sha256").update(url).digest("hex"),
  init() {
    if (!CACHE_DIR) return;
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    for (const f of fs.readdirSync(CACHE_DIR)) {
      if (f.endsWith(".tmp")) fs.rmSync(this.file(f), { force: true });
      else this.size += fs.statSync(this.file(f)).size;
    }
  },
  /** { meta, path } or null. */
  get(url) {
    if (!CACHE_DIR) return null;
    const k = this.key(url);
    try {
      const meta = JSON.parse(fs.readFileSync(this.file(`${k}.json`), "utf8"));
      const body = this.file(`${k}.body`);
      const now = new Date();
      fs.utimesSync(body, now, now); // recently used: evicted last
      return { meta, path: body };
    } catch {
      return null;
    }
  },
  /** A write stream that becomes the cached copy when it finishes whole. */
  put(url, meta) {
    if (!CACHE_DIR) return null;
    const k = this.key(url), tmp = this.file(`${k}.${process.pid}.${Date.now()}.tmp`);
    const ws = fs.createWriteStream(tmp);
    let ok = true;
    ws.on("error", () => ((ok = false), fs.rm(tmp, { force: true }, () => {})));
    return {
      stream: ws,
      done: (whole) => {
        ws.end(() => {
          if (!ok || !whole) return fs.rm(tmp, { force: true }, () => {});
          try {
            const n = fs.statSync(tmp).size;
            fs.writeFileSync(this.file(`${k}.json`), JSON.stringify(meta));
            fs.renameSync(tmp, this.file(`${k}.body`));
            this.size += n;
            if (this.size > CACHE_MAX) this.evict();
          } catch {
            fs.rm(tmp, { force: true }, () => {});
          }
        });
      },
    };
  },
  /** Oldest-used first, down to 80 % of the cap. */
  evict() {
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".body")).map((f) => ({ f, s: fs.statSync(this.file(f)) })).sort((a, b) => a.s.mtimeMs - b.s.mtimeMs);
    for (const { f, s } of files) {
      if (this.size <= CACHE_MAX * 0.8) break;
      fs.rmSync(this.file(f), { force: true });
      fs.rmSync(this.file(f.replace(/\.body$/, ".json")), { force: true });
      this.size -= s.size;
    }
  },
};

// ---------------------------------------------------------------- proxying
const upstream = new URL(ORIGIN);
const lib = upstream.protocol === "https:" ? https : http;
const agent = new lib.Agent({ keepAlive: true, maxSockets: 64, keepAliveMsecs: 30_000 });
const ipOf = (req) => String(req.socket?.remoteAddress ?? "").replace(/^::ffff:/, "");
const gzipOk = (req) => /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));

function serveCached(req, res, hit) {
  const h = { ...hit.meta.headers, "x-front-cache": "hit", "x-robots-tag": "noindex" };
  if (hit.meta.headers["content-encoding"] === "gzip" && !gzipOk(req)) {
    delete h["content-encoding"];
    delete h["content-length"];
    res.writeHead(200, h);
    return pipeline(fs.createReadStream(hit.path), zlib.createGunzip(), res, () => {});
  }
  res.writeHead(200, h);
  if (req.method === "HEAD") return res.end();
  pipeline(fs.createReadStream(hit.path), res, () => {});
}

function handle(req, res) {
  const url = new URL(req.url ?? "/", "https://front");
  if (url.pathname === "/__front/health") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ ok: true, version: VERSION, origin: ORIGIN, cacheMB: Math.round(cache.size / 1048576) }));
  }
  const method = (req.method ?? "GET").toUpperCase();
  const pathAndQuery = url.pathname + url.search;
  const mayKeep = askCacheable(method, url.pathname);
  if (mayKeep && (method === "GET" || method === "HEAD")) {
    const hit = cache.get(pathAndQuery);
    if (hit) return serveCached(req, res, hit);
  }

  const headers = upstreamHeaders(req.headers, { origin: ORIGIN, publicOrigin: PUBLIC_ORIGIN, key: KEY, ip: ipOf(req) });
  if (mayKeep) headers["accept-encoding"] = "gzip";
  const t0 = Date.now();
  res.on("finish", () => console.log(`${method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`));

  const up = lib.request({ protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port || undefined, path: pathAndQuery, method, headers, agent, timeout: TIMEOUT_MS, servername: upstream.hostname }, (r) => {
    const out = downstreamHeaders(r.headers, { origin: ORIGIN, publicOrigin: PUBLIC_ORIGIN });
    const keep = cacheable(method, url.pathname, r.statusCode ?? 0, r.headers) ? cache.put(pathAndQuery, { headers: pickKept(out) }) : null;
    const gzipped = r.headers["content-encoding"] === "gzip";
    if (gzipped && mayKeep && !gzipOk(req)) {
      delete out["content-encoding"];
      delete out["content-length"];
    }
    res.writeHead(r.statusCode ?? 502, { ...out, "x-front-cache": keep ? "miss" : "pass" });
    if (keep) {
      r.on("data", (c) => keep.stream.write(c));
      r.on("end", () => keep.done(r.complete));
      r.on("aborted", () => keep.done(false));
    }
    const toPlayer = gzipped && mayKeep && !gzipOk(req) ? [r, zlib.createGunzip(), res] : [r, res];
    pipeline(...toPlayer, () => {});
  });
  up.on("timeout", () => up.destroy(new Error("timeout")));
  up.on("error", () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>StreetQuest</title><body style="font:16px system-ui;padding:2em;text-align:center"><p dir="rtl">ارتباط با سرور بازی برقرار نشد — چند لحظه دیگر دوباره امتحان کنید.</p><p>Couldn't reach the game server — try again in a moment.</p><p><a href="">↻</a></p>`);
  });
  pipeline(req, up, () => {});
}

/** What a cached copy is served with. */
function pickKept(h) {
  const keep = {};
  for (const k of ["content-type", "content-encoding", "content-length", "cache-control", "etag", "last-modified", "access-control-allow-origin"]) if (h[k]) keep[k] = h[k];
  return keep;
}

// ---------------------------------------------------------------- the server
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (KEY && KEY.length < 16) {
    console.error("FRONT_KEY must be 16+ characters (openssl rand -hex 24).");
    process.exit(1);
  }
  cache.init();
  const onReq = (req, res) => {
    try {
      handle(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  };
  let server;
  const { TLS_CERT, TLS_KEY } = process.env;
  if (TLS_CERT && TLS_KEY) {
    const tls = () => ({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) });
    server = http2.createSecureServer({ ...tls(), allowHTTP1: true }, onReq);
    // The certificate renews every ~60 days (the realtime server's timer): take the new one without a restart.
    let seen = fs.statSync(TLS_CERT).mtimeMs;
    setInterval(() => {
      try {
        const m = fs.statSync(TLS_CERT).mtimeMs;
        if (m !== seen) (seen = m), server.setSecureContext(tls());
      } catch {}
    }, 3600_000).unref();
  } else {
    server = http.createServer(onReq); // tests, or behind something that does TLS
  }
  server.listen(PORT, () => console.log(`front door v${VERSION} :${server.address().port} → ${ORIGIN}${CACHE_DIR ? ` (cache ${CACHE_DIR}, ${Math.round(cache.size / 1048576)} MB)` : ""}`));
}
