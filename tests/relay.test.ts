// The relay a server abroad reads Snappfood, Torob and Divar through (relay/relay.mjs): only
// the game's own endpoints, only with the key, nothing about the caller, body passed through.
// It runs as its own process against a local stub of the sites.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { gzipSync } from "node:zlib";

const KEY = "test-key-0123456789";
const SITES = ["snappfood", "torob", "divar"];

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

let relay: ChildProcess;
let base = "";
before(async () => {
  const site = `http://127.0.0.1:${await listen(stub)}`;
  // Torob points at a port nobody listens on: the relay's "site unreachable".
  const gone = http.createServer();
  const dead = await listen(gone);
  await new Promise((r) => gone.close(r));
  relay = spawn(process.execPath, ["relay/relay.mjs"], {
    env: { ...process.env, PORT: "0", RELAY_KEY: KEY, SNAPPFOOD_ORIGIN: site, DIVAR_ORIGIN: site, TOROB_ORIGIN: `http://127.0.0.1:${dead}` },
    stdio: ["ignore", "pipe", "inherit"],
  });
  base = await new Promise<string>((resolve, reject) => {
    relay.stdout!.on("data", (d) => {
      const m = /listening on :(\d+)/.exec(String(d));
      if (m) resolve(`http://127.0.0.1:${m[1]}`);
    });
    relay.on("exit", (code) => reject(new Error(`relay exited (${code})`)));
  });
});
after(() => {
  relay?.kill();
  stub.close();
});

describe("store-site relay", () => {
  it("answers its health check without the key", async () => {
    const r = await fetch(`${base}/health`);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).sites, SITES);
  });

  it("forwards an allowed request with the app's User-Agent and nothing else about the caller", async () => {
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

  it("refuses a wrong key, other endpoints and other sites without asking anyone", async () => {
    seen = [];
    for (const path of [
      "/wrong-key-0123456789/snappfood/mobile/v3/restaurant/vendors-list",
      `/${KEY.slice(0, -1)}/snappfood/mobile/v3/restaurant/vendors-list`,
      `/${KEY}/snappfood/mobile/v3/user/profile`,
      `/${KEY}/snappfood/mobile/v3/restaurant/vendors-list/extra`,
      `/${KEY}/divar/v8/places/cities/x/districts`,
      `/${KEY}/example/v8/places/cities`,
      `/${KEY}/snappfood`,
      `/${KEY}`,
    ])
      assert.equal((await fetch(base + path)).status, 404, path);
    assert.equal(seen.length, 0);
  });

  it("takes POST only for Divar's ad search, with its body, and not a big one", async () => {
    seen = [];
    const post = (path: string, body = JSON.stringify({ city_ids: ["1"] })) =>
      fetch(`${base}/${KEY}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal((await post("/divar/v8/postlist/w/search")).status, 200);
    assert.deepEqual([seen[0].method, seen[0].body, seen[0].headers["content-type"]], ["POST", '{"city_ids":["1"]}', "application/json"]);
    assert.equal((await post("/snappfood/mobile/v3/restaurant/vendors-list")).status, 405);
    assert.equal((await fetch(`${base}/${KEY}/divar/v8/postlist/w/search`)).status, 405);
    assert.equal((await post("/divar/v8/postlist/w/search", "x".repeat(64 * 1024))).status, 413);
    assert.equal(seen.length, 1);
  });

  it("says 502 when the site doesn't answer", async () => {
    assert.equal((await fetch(`${base}/${KEY}/torob/v4/base-product/search/?q=milk`)).status, 502);
  });

  it("allows every endpoint the game calls", async () => {
    const src = readFileSync("src/server/localData.ts", "utf8");
    const paths = [...new Set([...src.matchAll(/`\$\{(?:root|sf|tr|dv)\}(\/[^`?]*)/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, "1")))];
    assert.ok(paths.length >= 10, `found only ${paths.length} endpoints in server/localData.ts`);
    for (const path of paths) {
      const codes = await Promise.all(
        SITES.flatMap((s) => ["GET", "POST"].map(async (method) => (await fetch(`${base}/${KEY}/${s}${path}`, { method, body: method === "POST" ? "{}" : undefined })).status)),
      );
      assert.ok(codes.some((c) => c !== 404 && c !== 405), `relay/relay.mjs doesn't forward ${path}`);
    }
  });
});
