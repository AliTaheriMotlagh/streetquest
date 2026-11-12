// The relay a server abroad reads the Iranian sites through (relay/relay.mjs): any path on the named
// sites and any public host on the generic route — so a new feature never needs it redeployed —
// but only with the key, never to a private address, nothing about the caller, body passed through.
// It runs as its own process against a local stub of the sites.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { gzipSync } from "node:zlib";

const KEY = "test-key-0123456789";
const SITES = ["snappfood", "torob", "divar", "takhfifan", "balad", "baladpoi", "cinematicket"];

type Seen = { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string };
let seen: Seen[] = [];
/** Every site answers its own path back as JSON, gzipped when asked. */
const stub = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push({ method: req.method, url: req.url, headers: req.headers, body });
    const json = JSON.stringify({ url: req.url });
    const gz = /gzip/.test(String(req.headers["accept-encoding"]));
    res.writeHead(200, { "content-type": "application/json", "set-cookie": "sid=1", ...(gz ? { "content-encoding": "gzip" } : {}) });
    res.end(gz ? gzipSync(json) : json);
  });
});
const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)));

let relay: ChildProcess, strict: ChildProcess;
let base = "", strictBase = "";
/** Start a relay; its base URL once it listens. */
function start(env: Record<string, string>) {
  const p = spawn(process.execPath, ["relay/relay.mjs"], { env: { ...process.env, PORT: "0", RELAY_KEY: KEY, ...env }, stdio: ["ignore", "pipe", "inherit"] });
  const url = new Promise<string>((resolve, reject) => {
    p.stdout!.on("data", (d) => {
      const m = /listening on :(\d+)/.exec(String(d));
      if (m) resolve(`http://127.0.0.1:${m[1]}`);
    });
    p.on("exit", (code) => reject(new Error(`relay exited (${code})`)));
  });
  return { p, url };
}
let stubPort = 0;
before(async () => {
  stubPort = await listen(stub);
  const site = `http://127.0.0.1:${stubPort}`;
  // Torob points at a port nobody listens on: the relay's "site unreachable".
  const gone = http.createServer();
  const dead = await listen(gone);
  await new Promise((r) => gone.close(r));
  const a = start({ SNAPPFOOD_ORIGIN: site, DIVAR_ORIGIN: site, TAKHFIFAN_ORIGIN: site, BALAD_ORIGIN: site, BALAD_POI_ORIGIN: site, CINEMATICKET_ORIGIN: site, TOROB_ORIGIN: `http://127.0.0.1:${dead}`, RELAY_ALLOW_PRIVATE: "1" });
  // As it runs in Iran: private addresses refused, the generic route narrowed to a few hosts.
  const b = start({ RELAY_HOSTS: "example.ir,localhost" });
  [relay, strict] = [a.p, b.p];
  [base, strictBase] = await Promise.all([a.url, b.url]);
});
after(() => {
  relay?.kill();
  strict?.kill();
  stub.close();
});

describe("store-site relay", () => {
  it("answers its health check without the key, with its version", async () => {
    const r = await fetch(`${base}/health`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual(j.sites, SITES);
    assert.equal(j.version, 2);
    assert.equal(j.generic, true);
  });

  it("forwards with the app's User-Agent and nothing else about the caller", async () => {
    seen = [];
    const path = "/mobile/v2/restaurant/details/dynamic?vendorCode=p6d6n6&lat=35.73&long=51.53";
    const r = await fetch(`${base}/${KEY}/snappfood${path}`, {
      headers: { "user-agent": "StreetQuest/1.0", cookie: "session=secret", authorization: "Bearer x", "x-forwarded-for": "5.6.7.8" },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { url: path });
    assert.equal(r.headers.get("content-encoding"), "gzip", "the compressed body is passed straight through");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("set-cookie"), null);
    const h = seen[0].headers;
    assert.equal(h["user-agent"], "StreetQuest/1.0");
    for (const name of ["cookie", "authorization", "x-forwarded-for"]) assert.equal(h[name], undefined, name);
  });

  it("passes a header the site needs only when the app sends it as x-relay-<name>", async () => {
    seen = [];
    await fetch(`${base}/${KEY}/divar/v8/anything`, { headers: { "x-relay-api-key": "k1", "x-relay-cookie": "a=1" } });
    assert.equal(seen[0].headers["api-key"], "k1");
    assert.equal(seen[0].headers.cookie, "a=1");
    assert.equal(seen[0].headers["x-relay-api-key"], undefined);
  });

  it("forwards any path on a named site — a new endpoint needs no redeploy", async () => {
    seen = [];
    for (const path of ["/mobile/v9/some/new/endpoint?x=1", "/v5/api/magento/vendors/53670/complaints", "/"])
      assert.equal((await fetch(`${base}/${KEY}/takhfifan${path}`)).status, 200, path);
    assert.deepEqual(seen.map((s) => s.url), ["/mobile/v9/some/new/endpoint?x=1", "/v5/api/magento/vendors/53670/complaints", "/"]);
  });

  it("refuses a wrong key and unknown sites without asking anyone", async () => {
    seen = [];
    for (const path of [
      "/wrong-key-0123456789/snappfood/mobile/v3/restaurant/vendors-list",
      `/${KEY.slice(0, -1)}/snappfood/mobile/v3/restaurant/vendors-list`,
      `/${KEY}/example/v8/places/cities`,
      `/${KEY}/snappfood`,
      `/${KEY}`,
      `/wrong-key-0123456789/https/example.ir/x`,
    ])
      assert.equal((await fetch(base + path)).status, 404, path);
    assert.equal(seen.length, 0);
  });

  it("takes POST, PUT and the rest with their body — not a huge one, nor odd methods", async () => {
    seen = [];
    const send = (method: string, path: string, body = JSON.stringify({ city_ids: ["1"] })) =>
      fetch(`${base}/${KEY}${path}`, { method, headers: { "content-type": "application/json" }, body });
    assert.equal((await send("POST", "/divar/v8/postlist/w/search")).status, 200);
    assert.deepEqual([seen[0].method, seen[0].body, seen[0].headers["content-type"]], ["POST", '{"city_ids":["1"]}', "application/json"]);
    assert.equal((await send("PUT", "/snappfood/x")).status, 200);
    assert.equal(seen[1].method, "PUT");
    assert.equal((await send("POST", "/divar/v8/postlist/w/search", "x".repeat(2 * 1024 * 1024))).status, 413);
    assert.equal((await fetch(`${base}/${KEY}/divar/x`, { method: "OPTIONS" })).status, 405);
    assert.equal(seen.length, 2);
  });

  it("says 502 when the site doesn't answer", async () => {
    assert.equal((await fetch(`${base}/${KEY}/torob/v4/base-product/search/?q=milk`)).status, 502);
  });
});

describe("the generic route", () => {
  it("reaches any host by its name: /<key>/https/<host>/<path>", async () => {
    seen = [];
    const r = await fetch(`${base}/${KEY}/http/127.0.0.1:${stubPort}/api/v1/new-site?q=1`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { url: "/api/v1/new-site?q=1" });
  });

  it("never reaches a private, loopback or link-local address (other services on the server)", async () => {
    for (const host of ["127.0.0.1", "localhost", "10.0.0.5", "169.254.169.254", "192.168.1.1", "[::1]"]) {
      const r = await fetch(`${strictBase}/${KEY}/https/${host}/x`);
      assert.ok(r.status === 403 || r.status === 404, `${host}: ${r.status}`);
    }
    assert.equal((await fetch(`${strictBase}/${KEY}/http/example.ir/x`)).status, 404, "plain http only in tests");
  });

  it("keeps to RELAY_HOSTS when it is set, and to plain host names", async () => {
    for (const host of ["evil.com", "example.ir.evil.com", "user@example.ir", "exa_mple.ir"]) assert.equal((await fetch(`${strictBase}/${KEY}/https/${host}/x`)).status, 404, host);
  });

  it("knows a private address and an allowed host", async () => {
    const { privateAddress, hostAllowed } = await import("../relay/relay.mjs");
    for (const ip of ["10.1.2.3", "127.0.0.1", "172.20.0.1", "192.168.0.9", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) assert.ok(privateAddress(ip), ip);
    for (const ip of ["37.32.28.215", "8.8.8.8", "172.32.0.1", "2a01:4f8::1"]) assert.ok(!privateAddress(ip), ip);
    assert.ok(hostAllowed("api.snappfood.ir", ["snappfood.ir"]));
    assert.ok(!hostAllowed("snappfood.ir.evil.com", ["snappfood.ir"]));
    assert.ok(hostAllowed("anything.com", ["*"]));
  });
});

describe("the app's endpoints", () => {
  it("every endpoint the game calls goes through", async () => {
    const src = readFileSync("src/server/localData.ts", "utf8");
    const paths = [...new Set([...src.matchAll(/`\$\{(?:root|sf|tr|dv|bl|poi)\}(\/[^`?]*)/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, "123456")))];
    assert.ok(paths.length >= 10, `found only ${paths.length} endpoints in server/localData.ts`);
    for (const path of paths) assert.equal((await fetch(`${base}/${KEY}/divar${path}`)).status, 200, path);
  });
});
