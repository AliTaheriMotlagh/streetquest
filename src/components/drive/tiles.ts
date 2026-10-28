"use client";
// Getting map tiles into the 3D city fast:
//  - VectorSource (primary): street-map vector tiles, one ~2 km square at a time,
//    downloaded and sliced into cells on a worker (vectorTile.ts). Exact geometry from
//    a CDN in a fraction of a second; cells are kept in memory and IndexedDB.
//  - TileSource (fallback): the server's Overpass tiles, per cell — used for any cell
//    whose vector tile can't be reached.
//  - BuildPool: turns cells into geometry on Web Workers, so the main thread only
//    uploads finished arrays. Falls back to building inline when workers aren't there.
import { TILE_V, type CityDetail, type CityTile } from "@/lib/city";
import type { LatLng } from "@/lib/geo";
import { api } from "../game/client";
import { buildTileArrays, type Cut, type Style, type TileArrays } from "./tileMesh";
import { vtKey, vtTilesForCell, type NameMode, type VtCell } from "./vectorTile";

// ---------------------------------------------------------------- IndexedDB cache
const DB = "sq-city";
const STORE = "tiles";
const KEEP = 600; // tiles kept on the device (~25–60 MB at most in a dense city)
const STALE_MS = 3 * 86_400_000; // older than this: show it, and refresh in the background
type Cached = { key: string; v: number; at: number; tile: CityTile };

let dbp: Promise<IDBDatabase | null> | null = null;
function db() {
  dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" }).createIndex("at", "at");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null); // private mode, no IndexedDB
    }
  });
  return dbp;
}

async function idbGet(key: string): Promise<Cached | null> {
  return idbRead(key);
}
async function idbRead<T = Cached>(key: string): Promise<T | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const r = d.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as T | undefined) ?? null);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let puts = 0;
async function idbPut(tile: CityTile, key = tile.key) {
  const d = await db();
  if (!d) return;
  try {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key, v: tile.v ?? 1, at: Date.now(), tile } satisfies Cached);
    if (++puts % 40 === 0) trim(d);
  } catch {}
}

/** Drop the oldest tiles past KEEP. */
function trim(d: IDBDatabase) {
  try {
    const store = d.transaction(STORE, "readwrite").objectStore(STORE);
    const count = store.count();
    count.onsuccess = () => {
      let extra = count.result - KEEP;
      if (extra <= 0) return;
      store.index("at").openCursor().onsuccess = (e) => {
        const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cur || extra-- <= 0) return;
        cur.delete();
        cur.continue();
      };
    };
  } catch {}
}

// Tiles stay in memory between drives in one visit: re-entering the city is instant.
const memory = new Map<string, CityTile>();
const remember = (t: CityTile) => {
  memory.delete(t.key);
  memory.set(t.key, t);
  if (memory.size > 120) memory.delete(memory.keys().next().value!);
};

// ---------------------------------------------------------------- TileSource
type Want = { key: string; tries: number; retryAt: number; inflight: boolean; done: boolean; stale: boolean };
type Reply = { tiles: Record<string, { tile: CityTile | null; pending: boolean }> };

/**
 * City-pack street detail (lib/cityPack.ts) for the cells around us, asked for in
 * batches. `onDetail` hears about each cell that has some; `get` is null for cells
 * without (or not yet in).
 */
export class DetailSource {
  private state = new Map<string, CityDetail | null | "loading">();
  private batch = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private onDetail: (key: string, d: CityDetail) => void) {}

  get(key: string) {
    const s = this.state.get(key);
    return s && s !== "loading" ? s : null;
  }

  want(keys: string[]) {
    for (const k of keys) {
      if (this.state.has(k)) continue;
      this.state.set(k, "loading");
      this.batch.add(k);
    }
    if (this.batch.size) this.timer ??= setTimeout(() => this.flush(), 30);
  }

  forget(key: string) {
    this.state.delete(key);
    this.batch.delete(key);
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private flush() {
    this.timer = null;
    const keys = [...this.batch].slice(0, 25);
    keys.forEach((k) => this.batch.delete(k));
    if (this.batch.size) this.timer = setTimeout(() => this.flush(), 30);
    // Public and cached at the edge: a plain fetch, so the browser's cache helps too.
    fetch(`/api/city/detail?keys=${keys.join(",")}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((r: { cells?: Record<string, CityDetail | null> }) => {
        if (this.disposed) return;
        for (const k of keys) {
          if (this.state.get(k) !== "loading") continue; // forgotten meanwhile
          const d = r.cells?.[k] ?? null;
          this.state.set(k, d);
          if (d) this.onDetail(k, d);
        }
      })
      .catch(() => {
        // Asked again next time the cell is wanted.
        for (const k of keys) if (this.state.get(k) === "loading") this.state.delete(k);
      });
  }
}

export class TileSource {
  private wants = new Map<string, Want>();
  private batch = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = 0;
  private disposed = false;

  /** `onTile` gets every real tile once (and again if a fresher copy arrives). */
  constructor(private onTile: (tile: CityTile) => void) {}

  /** Make sure these cells are loading (nearest first). Repeated calls are cheap. */
  want(keys: string[]) {
    const now = performance.now();
    for (const key of keys) {
      const w = this.wants.get(key);
      if (w) {
        if (!w.done && !w.inflight && w.retryAt && now >= w.retryAt) this.queue(w);
        continue;
      }
      const fresh: Want = { key, tries: 0, retryAt: 0, inflight: false, done: false, stale: false };
      this.wants.set(key, fresh);
      const hit = memory.get(key);
      if (hit) {
        fresh.done = true;
        this.onTile(hit);
        continue;
      }
      fresh.inflight = true;
      void idbGet(key).then((c) => {
        if (this.disposed) return;
        fresh.inflight = false;
        if (c?.tile) {
          remember(c.tile);
          this.onTile(c.tile);
          fresh.done = true;
          // Old copy or older format: show it now, refresh quietly.
          if ((c.v ?? 1) < TILE_V || Date.now() - c.at > STALE_MS) {
            fresh.stale = true;
            this.queue(fresh);
          }
          return;
        }
        this.queue(fresh);
      });
    }
  }

  /** Stop caring about a cell (driven away). */
  forget(key: string) {
    this.wants.delete(key);
    this.batch.delete(key);
  }

  /** How many cells are still on their way from the server. */
  get loading() {
    let n = 0;
    for (const w of this.wants.values()) if (!w.done) n++;
    return n;
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private queue(w: Want) {
    w.retryAt = 0;
    this.batch.add(w.key);
    if (this.batch.size >= 9) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), 40);
  }

  private flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.disposed || !this.batch.size) return;
    if (this.running >= 2) {
      this.timer = setTimeout(() => this.flush(), 150);
      return;
    }
    const keys = [...this.batch].slice(0, 9);
    keys.forEach((k) => this.batch.delete(k));
    const group = keys.map((k) => this.wants.get(k)).filter((w): w is Want => !!w);
    if (!group.length) return;
    for (const w of group) w.inflight = true;
    // The first ask doesn't wait for OpenStreetMap; later ones let the server wait a little.
    const first = group.every((w) => w.tries === 0);
    this.running++;
    api<Reply>(`/api/city?keys=${keys.join(",")}${first ? "&wait=0" : ""}`)
      .then((r) => {
        for (const w of group) {
          w.inflight = false;
          w.tries++;
          const got = r.tiles?.[w.key];
          if (got?.tile) {
            const known = memory.get(w.key);
            const same = known && known.v === got.tile.v && known.b.length === got.tile.b.length && known.r.length === got.tile.r.length && known.p.length === got.tile.p.length;
            remember(got.tile);
            void idbPut(got.tile);
            w.done = true;
            if (!same && this.wants.has(w.key)) this.onTile(got.tile);
          } else if (got?.pending && w.tries < 14) w.retryAt = performance.now() + 5000;
          else w.done = true; // no data for this cell: the village stays
        }
      })
      .catch(() => {
        for (const w of group) {
          w.inflight = false;
          w.tries++;
          if (w.tries < 6) w.retryAt = performance.now() + 8000;
          else w.done = true;
        }
      })
      .finally(() => {
        this.running--;
        if (this.batch.size) this.flush();
      });
  }
}

// ---------------------------------------------------------------- BuildPool
type Job = { id: number; resolve: (a: never) => void; reject: (e: unknown) => void };
type WorkerReply = { id: number; arrays?: TileArrays; cells?: VtCell[]; empty?: boolean; error?: string };

export class BuildPool {
  private workers: { w: Worker; busy: Job | null }[] = [];
  private nextId = 1;
  private broken = false;
  private inline = 0;

  constructor(size: number) {
    if (typeof Worker === "undefined") return;
    for (let i = 0; i < size; i++) {
      try {
        const w = new Worker(new URL("./tile.worker.ts", import.meta.url));
        const slot = { w, busy: null as Job | null };
        w.onmessage = (e: MessageEvent<WorkerReply>) => {
          const job = slot.busy;
          slot.busy = null;
          if (!job || job.id !== e.data.id) return;
          if (e.data.error) job.reject(new Error(e.data.error));
          else job.resolve((e.data.arrays ?? { cells: e.data.cells ?? [], empty: !!e.data.empty }) as never);
        };
        w.onerror = () => {
          // A worker that can't load (old browser, CSP): build on the main thread instead.
          this.broken = true;
          slot.busy?.reject(new Error("worker failed"));
          slot.busy = null;
        };
        this.workers.push(slot);
      } catch {
        this.broken = true;
      }
    }
  }

  /** Room for another job right now? */
  get free() {
    if (this.broken || !this.workers.length) return this.inline === 0;
    return this.workers.some((s) => !s.busy);
  }

  build(tile: CityTile, origin: LatLng, style: Style, lite: boolean, cuts: Cut[] = []): Promise<TileArrays> {
    const slot = !this.broken ? this.workers.find((s) => !s.busy) : undefined;
    if (!slot) {
      // Inline fallback: one at a time, on the next macrotask so a frame can render first.
      this.inline++;
      return new Promise<TileArrays>((resolve, reject) =>
        setTimeout(() => {
          try {
            resolve(buildTileArrays(tile, origin, style, lite, cuts));
          } catch (e) {
            reject(e);
          } finally {
            this.inline--;
          }
        }, 0),
      );
    }
    return this.send<TileArrays>(slot, { kind: "build", tile, origin, style, lite, cuts });
  }

  /** Download and slice one zoom-14 street-map tile (needs a working worker). */
  slice(x: number, y: number, locale: string, infill: boolean, names: NameMode): Promise<{ cells: VtCell[]; empty: boolean }> {
    const slot = !this.broken ? this.workers.find((s) => !s.busy) : undefined;
    if (!slot) return Promise.reject(new Error(this.broken || !this.workers.length ? "no worker" : "busy"));
    return this.send(slot, { kind: "vt", x, y, locale, infill, names });
  }

  /** Workers exist and haven't failed. */
  get ok() {
    return !this.broken && this.workers.length > 0;
  }

  private send<T>(slot: { w: Worker; busy: Job | null }, msg: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = { id: this.nextId++, resolve: resolve as (a: never) => void, reject };
      slot.busy = job;
      slot.w.postMessage({ id: job.id, ...msg });
    });
  }

  dispose() {
    for (const s of this.workers) s.w.terminate();
    this.workers = [];
  }
}

// ---------------------------------------------------------------- VectorSource
/** Bump when vectorTile.ts slices differently: cached cells from older code are refetched. */
const VT_CELL_V = 1;
const VT_STALE_MS = 14 * 86_400_000;
const vtMemory = new Map<string, CityTile>();
type VtWant = { key: string; need: string[]; done: boolean; failed: boolean };
type VtTile = { state: "queued" | "loading" | "done" | "failed"; tries: number; retryAt: number; cells: Map<string, VtCell> };

export class VectorSource {
  private wants = new Map<string, VtWant>();
  private tiles = new Map<string, VtTile>();
  private queue: string[] = [];
  private disposed = false;
  private timer: ReturnType<typeof setInterval>;

  /**
   * `onTile`: a finished cell (real map data). `onFail`: this cell's map couldn't be
   * reached — the caller falls back to another source.
   */
  constructor(private pool: BuildPool, private locale: string, private infill: boolean, private names: NameMode, private onTile: (t: CityTile) => void, private onFail: (key: string) => void) {
    this.timer = setInterval(() => this.pump(), 300);
  }

  private cacheKey = (cell: string) => `vt${VT_CELL_V}:${this.locale}:${this.names}:${this.infill ? 1 : 0}:${cell}`;

  want(keys: string[]) {
    for (const key of keys) {
      const have = this.wants.get(key);
      if (have) continue;
      const [cx, cy] = key.split("_").map(Number);
      const w: VtWant = { key, need: vtTilesForCell(cx, cy).map((t) => vtKey(t.x, t.y)), done: false, failed: false };
      this.wants.set(key, w);
      const mem = vtMemory.get(this.cacheKey(key));
      if (mem) {
        w.done = true;
        this.onTile(mem);
        continue;
      }
      void idbRead(this.cacheKey(key)).then((c) => {
        if (this.disposed || this.wants.get(key) !== w) return;
        if (c?.tile && Date.now() - c.at < VT_STALE_MS) {
          vtMemory.set(this.cacheKey(key), c.tile);
          w.done = true;
          this.onTile(c.tile);
          return;
        }
        for (const t of w.need) this.request(t);
        this.complete(w);
      });
    }
  }

  forget(key: string) {
    this.wants.delete(key);
  }

  get loading() {
    let n = 0;
    for (const w of this.wants.values()) if (!w.done && !w.failed) n++;
    return n;
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
  }

  private request(t: string) {
    const have = this.tiles.get(t);
    if (have && have.state !== "failed") return;
    if (have?.state === "failed" && performance.now() < have.retryAt) return;
    this.tiles.set(t, { state: "queued", tries: have?.tries ?? 0, retryAt: 0, cells: new Map() });
    this.queue.push(t);
    this.pump();
  }

  private pump() {
    if (this.disposed) return;
    // FIFO: cells are asked for nearest first, so their tiles queue nearest first.
    while (this.queue.length && this.pool.ok && this.pool.free) {
      const t = this.queue.shift()!;
      const [x, y] = t.split("/").map(Number);
      const tile = this.tiles.get(t)!;
      tile.state = "loading";
      this.pool
        .slice(x, y, this.locale, this.infill, this.names)
        .then(({ cells }) => {
          tile.state = "done";
          for (const c of cells) tile.cells.set(c.key, c);
        })
        .catch(() => {
          tile.tries++;
          tile.state = "failed";
          tile.retryAt = performance.now() + 4000 * tile.tries;
        })
        .finally(() => {
          if (this.disposed) return;
          for (const w of this.wants.values()) if (!w.done && w.need.includes(t)) this.complete(w);
          this.pump();
        });
    }
    // Retry failed tiles a couple of times before giving their cells to the fallback.
    for (const w of this.wants.values()) {
      if (w.done || w.failed) continue;
      for (const t of w.need) {
        const tile = this.tiles.get(t);
        if (tile?.state === "failed" && tile.tries < 3 && performance.now() >= tile.retryAt) this.request(t);
      }
    }
    if (!this.pool.ok) for (const w of this.wants.values()) if (!w.done && !w.failed) ((w.failed = true), this.onFail(w.key));
  }

  /** All the cell's vector tiles are in: merge their pieces of it and hand it over. */
  private complete(w: VtWant) {
    if (w.done || w.failed) return;
    const parts = w.need.map((t) => this.tiles.get(t));
    if (parts.some((p) => p?.state === "failed" && p.tries >= 3)) {
      w.failed = true;
      this.onFail(w.key);
      return;
    }
    if (!parts.every((p) => p?.state === "done")) return;
    const [cx, cy] = w.key.split("_").map(Number);
    const cell: VtCell = { v: TILE_V, key: w.key, cx, cy, real: true, b: [], r: [], a: [], p: [], o: [], s: [], hn: [] };
    for (const p of parts) {
      const c = p!.cells.get(w.key);
      if (!c) continue;
      cell.b.push(...c.b);
      cell.r.push(...c.r);
      cell.a.push(...c.a);
      cell.o!.push(...(c.o ?? []));
      cell.s!.push(...(c.s ?? []));
      cell.hn!.push(...(c.hn ?? []));
    }
    w.done = true;
    vtMemory.set(this.cacheKey(w.key), cell);
    if (vtMemory.size > 160) vtMemory.delete(vtMemory.keys().next().value!);
    void idbPut(cell, this.cacheKey(w.key));
    this.onTile(cell);
  }
}
