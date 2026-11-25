// The Iran front door (front/front.mjs): the whole site at an address in Iran. Passes everything on to the
// real site with the player's address (only with the key), rewrites redirects and cookies to itself, drops
// Cloudflare-only headers, and keeps build files on disk so they cross the border once.
// It runs as its own process (plain HTTP here) in front of a local stub of the site.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import { askCacheable, cacheable, downstreamHeaders, upstreamHeaders } from "../front/front.mjs";

const KEY = "front-key-0123456789";
const PUB = "https://1-2-3-4.sslip.io:8443";
type Seen = { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string };
let seen: Seen[] = [];
let site = "";
const stub = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (req.url === "/go") {
      res.writeHead(307, { location: `${site}/play?x=1`, "alt-svc": 'h3=":443"', "strict-transport-security": "max-age=1" });
      return res.end();
    }
    if (req.url === "/login") {
      res.writeHead(200, { "set-cookie": ["sq=1; Domain=streetquest.remixt.app; Path=/; Secure", "b=2; Path=/"], "content-type": "application/json" });
      return res.end("{}");
    }
    const text = `file ${req.url}`;
    const gz = /gzip/.test(String(req.headers["accept-encoding"]));
    const cc = req.url!.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : req.url!.startsWith("/api/") ? "no-store" : "public, max-age=0";
    res.writeHead(200, { "content-type": "text/plain", "cache-control": cc, ...(gz ? { "content-encoding": "gzip" } : {}) });
    res.end(gz ? gzipSync(text) : text);
  });
});
const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)));

let front: ChildProcess;
let base = "";
const dir = mkdtempSync(path.join(tmpdir(), "sq-front-"));
before(async () => {
  site = `http://127.0.0.1:${await listen(stub)}`;
  front = spawn(process.execPath, ["front/front.mjs"], { env: { ...process.env, PORT: "0", ORIGIN: site, PUBLIC_ORIGIN: PUB, FRONT_KEY: KEY, CACHE_DIR: dir, CACHE_MB: "5" }, stdio: ["ignore", "pipe", "inherit"] });
  base = await new Promise<string>((resolve, reject) => {
    front.stdout!.on("data", (d) => {
      const m = /front door v\d+ :(\d+)/.exec(String(d));
      if (m) resolve(`http://127.0.0.1:${m[1]}`);
    });
    front.on("exit", (code) => reject(new Error(`front exited (${code})`)));
  });
});
after(() => {
  front?.kill();
  stub.close();
  rmSync(dir, { recursive: true, force: true });
});
const get = (p: string, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    http.get(`${base}${p}`, { headers }, (r) => {
      let b = "";
      r.setEncoding("latin1");
      r.on("data", (c) => (b += c));
      r.on("end", () => resolve({ status: r.statusCode!, headers: r.headers, body: b }));
    }).on("error", reject);
  });

describe("front door", () => {
  it("answers its health check", async () => {
    const r = await get("/__front/health");
    const j = JSON.parse(r.body);
    assert.equal(j.ok, true);
    assert.equal(j.version, 1);
  });

  it("passes the request on with the player's address and the key, never forged ones", async () => {
    seen = [];
    const r = await fetch(`${base}/api/me?lat=35.7`, { headers: { cookie: "sq=abc", "x-front-ip": "9.9.9.9", "x-front-key": "nope", "cf-connecting-ip": "8.8.8.8", "x-forwarded-for": "7.7.7.7", origin: PUB, referer: `${PUB}/play` } });
    assert.equal(r.status, 200);
    const h = seen[0].headers;
    assert.equal(seen[0].url, "/api/me?lat=35.7");
    assert.equal(h.cookie, "sq=abc");
    assert.equal(h["x-front-key"], KEY);
    assert.equal(h["x-front-ip"], "127.0.0.1");
    assert.equal(h["cf-connecting-ip"], undefined);
    assert.equal(h["x-forwarded-for"], undefined);
    assert.equal(h.host, new URL(site).host);
    assert.equal(h.origin, site);
    assert.equal(h.referer, `${site}/play`);
    assert.equal(r.headers.get("x-robots-tag"), "noindex");
  });

  it("passes request bodies through", async () => {
    seen = [];
    await fetch(`${base}/api/loc`, { method: "POST", body: JSON.stringify({ lat: 1 }), headers: { "content-type": "application/json" } });
    assert.equal(seen[0].method, "POST");
    assert.equal(seen[0].body, '{"lat":1}');
  });

  it("rewrites redirects and cookies to itself, and drops Cloudflare-only headers", async () => {
    const r = await get("/go");
    assert.equal(r.status, 307);
    assert.equal(r.headers.location, `${PUB}/play?x=1`);
    assert.equal(r.headers["alt-svc"], undefined);
    assert.equal(r.headers["strict-transport-security"], undefined);
    const c = await get("/login");
    assert.deepEqual(c.headers["set-cookie"], ["sq=1; Path=/; Secure", "b=2; Path=/"]);
  });

  it("keeps build files on disk: the second player gets them without asking the site", async () => {
    seen = [];
    const a = await get("/_next/static/chunks/app.js", { "accept-encoding": "gzip, br" });
    assert.equal(a.headers["x-front-cache"], "miss");
    await new Promise((r) => setTimeout(r, 150));
    const b = await get("/_next/static/chunks/app.js", { "accept-encoding": "gzip" });
    assert.equal(b.headers["x-front-cache"], "hit");
    assert.equal(b.headers["content-encoding"], "gzip");
    assert.equal(seen.length, 1, "the site was asked once");
    // A browser without gzip gets it unpacked.
    const c = await get("/_next/static/chunks/app.js");
    assert.equal(c.headers["content-encoding"], undefined);
    assert.equal(c.body, "file /_next/static/chunks/app.js");
  });

  it("never keeps the game's answers or pages", async () => {
    seen = [];
    await get("/api/sync");
    await get("/api/sync");
    await get("/play", { "accept-encoding": "gzip" });
    await get("/play", { "accept-encoding": "gzip" });
    assert.equal(seen.length, 4);
  });
});

describe("front door rules", () => {
  it("decides what is kept", () => {
    assert.equal(cacheable("GET", "/_next/static/x.js", 200, {}), true);
    assert.equal(cacheable("GET", "/models/cars/a.glb", 200, { "cache-control": "public, max-age=31536000, immutable" }), true);
    assert.equal(cacheable("GET", "/_next/static/x.js", 404, {}), false);
    assert.equal(cacheable("POST", "/_next/static/x.js", 200, {}), false);
    assert.equal(cacheable("GET", "/_next/static/x.js", 200, { "set-cookie": "a=1" }), false);
    assert.equal(cacheable("GET", "/play", 200, { "cache-control": "public, max-age=60" }), false);
    assert.equal(cacheable("GET", "/x", 200, { "cache-control": "private, immutable" }), false);
    assert.equal(askCacheable("GET", "/api/x"), false);
    assert.equal(askCacheable("GET", "/models/a.glb"), true);
  });
  it("builds headers without hop-by-hop or HTTP/2 pseudo-headers", () => {
    const up = upstreamHeaders({ ":path": "/", connection: "keep-alive", "true-client-ip": "1.1.1.1", accept: "*/*" }, { origin: "https://a.app", publicOrigin: PUB, key: "", ip: "5.5.5.5" });
    assert.deepEqual(up, { accept: "*/*", host: "a.app", "x-forwarded-proto": "https" }, "no key: no x-front-*");
    const down = downstreamHeaders({ "transfer-encoding": "chunked", "content-type": "text/html", nel: "{}", location: "https://other.site/x" }, { origin: "https://a.app", publicOrigin: PUB });
    assert.deepEqual(down, { "content-type": "text/html", location: "https://other.site/x", "x-robots-tag": "noindex" });
  });
});
