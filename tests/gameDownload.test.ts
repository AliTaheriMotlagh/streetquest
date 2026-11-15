import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSETS_CACHE, autoDownload, CARS_CACHE, cacheFor, etaOf, fmtBytes, forLanguage, IDLE, nextSpeed, pctOf, plan } from "../src/lib/gameDownload";

test("each file goes in the cache the service worker serves it from", () => {
  assert.equal(cacheFor("/models/cars/peugeot.3f9a.glb"), CARS_CACHE);
  assert.equal(cacheFor("/models/people/men.glb"), CARS_CACHE);
  assert.equal(cacheFor("/models/arena/soldier.glb"), ASSETS_CACHE);
  assert.equal(cacheFor("/sounds/voice/greet-1-m.mp3"), ASSETS_CACHE);
  assert.equal(cacheFor("/draco/draco_decoder.wasm"), ASSETS_CACHE);
  assert.equal(cacheFor("/media/ad.mp4"), null);
});

test("only the player's language's voices", () => {
  const files = [{ u: "/sounds/voice/a-m.mp3", b: 1 }, { u: "/sounds/voice/en/a-m.mp3", b: 1 }, { u: "/sounds/voice/tr/a-m.mp3", b: 1 }, { u: "/sounds/voice/manifest.json", b: 1 }, { u: "/sounds/horn.mp3", b: 1 }];
  assert.deepEqual(forLanguage(files, "fa").map((f) => f.u), ["/sounds/voice/a-m.mp3", "/sounds/voice/manifest.json", "/sounds/horn.mp3"]);
  assert.deepEqual(forLanguage(files, "en").map((f) => f.u), ["/sounds/voice/en/a-m.mp3", "/sounds/voice/manifest.json", "/sounds/horn.mp3"]);
});

test("the plan skips what's on the phone, biggest first", () => {
  const p = plan([{ u: "/models/a.glb", b: 10 }, { u: "/models/b.glb", b: 30 }, { u: "/sounds/c.mp3", b: 20 }, { u: "/media/x.mp4", b: 999 }], new Set(["/models/a.glb"]));
  assert.deepEqual(p.todo.map((f) => f.u), ["/models/b.glb", "/sounds/c.mp3"]);
  assert.deepEqual([p.bytes, p.total, p.had], [50, 60, 10]);
});

test("progress, speed and time left", () => {
  let s = nextSpeed(null, 0, 0);
  s = nextSpeed(s, 1000, 1000);
  assert.equal(s.bps, 1000);
  assert.equal(nextSpeed(s, 5000, 1100), s); // too soon: merged
  s = nextSpeed(s, 3000, 2000); // 2000 B/s this second → moving average 1300
  assert.equal(Math.round(s.bps), 1300);
  const st = { ...IDLE, phase: "downloading" as const, done: 2000, bytes: 10_000, total: 20_000, had: 10_000, bps: 1000 };
  assert.equal(pctOf(st), 60);
  assert.equal(etaOf(st), 8);
  assert.equal(etaOf({ ...st, bps: 0 }), null);
});

test("sizes and when to start by itself", () => {
  assert.deepEqual(fmtBytes(500), { n: 1, unit: "KB" });
  assert.deepEqual(fmtBytes(4.25 * 1024 * 1024), { n: 4.3, unit: "MB" });
  assert.deepEqual(fmtBytes(17.4 * 1024 * 1024), { n: 17, unit: "MB" });
  assert.equal(autoDownload(undefined), true);
  assert.equal(autoDownload({ saveData: true }), false);
  assert.equal(autoDownload({ effectiveType: "3g" }), false);
  assert.equal(autoDownload({ effectiveType: "4g" }), true);
});
