// A small reader for OpenStreetMap .osm.pbf extracts (e.g. Geofabrik's country files), for
// scripts/city-pack.ts: no Overpass server, no rate limits, the whole country in a few
// minutes. Two passes over the file: tagged nodes and the wanted ways, then the
// coordinates of those ways' nodes. Gives Overpass-shaped elements (`out geom`).
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import Pbf from "pbf";

export type OsmElement = { type: "node" | "way"; id: number; lat?: number; lon?: number; tags: Record<string, string>; geometry?: { lat: number; lon: number }[] };
type Want = {
  /** Is this point somewhere we care about? */
  inside: (lat: number, lon: number) => boolean;
  node: (tags: Record<string, string>) => boolean;
  way: (tags: Record<string, string>) => boolean;
};
type Block = { strings: string[]; groups: [number, number][]; gran: number; latOff: number; lonOff: number; buf: Uint8Array };

/** Every OSMData block in the file, decompressed. */
function* blocks(file: Buffer): Generator<Block> {
  let pos = 0;
  while (pos + 4 <= file.length) {
    const hlen = file.readUInt32BE(pos);
    pos += 4;
    const head = { type: "", size: 0 };
    new Pbf(file.subarray(pos, pos + hlen)).readFields((tag, h, p) => {
      if (tag === 1) h.type = p.readString();
      else if (tag === 3) h.size = p.readVarint();
    }, head);
    pos += hlen;
    const blob = file.subarray(pos, pos + head.size);
    pos += head.size;
    if (head.type !== "OSMData") continue;
    let data: Uint8Array | null = null;
    new Pbf(blob).readFields((tag, _o, p) => {
      if (tag === 1) data = p.readBytes();
      else if (tag === 3) data = inflateSync(p.readBytes());
    }, {});
    if (!data) throw new Error("unsupported blob compression (only raw and zlib are read)");
    const buf: Uint8Array = data;
    const blk: Block = { strings: [], groups: [], gran: 100, latOff: 0, lonOff: 0, buf };
    new Pbf(buf).readFields((tag, b, p) => {
      if (tag === 1) {
        const end = p.readVarint() + p.pos;
        p.readFields((t, s: string[], q) => t === 1 && s.push(q.readString()), b.strings, end);
      } else if (tag === 2) {
        const len = p.readVarint();
        b.groups.push([p.pos, p.pos + len]);
        p.pos += len;
      } else if (tag === 17) b.gran = p.readVarint();
      else if (tag === 19) b.latOff = p.readVarint(true);
      else if (tag === 20) b.lonOff = p.readVarint(true);
    }, blk);
    yield blk;
  }
}

type Way = { id: number; keys: number[]; vals: number[]; refs: number[] };
type Plain = { id: number; keys: number[]; vals: number[]; lat: number; lon: number };
type Dense = { id: number[]; lat: number[]; lon: number[]; kv: number[] };

/** Call back for each node (id, lat, lon, tags or null) and way in a block. */
function walk(b: Block, onNode: (id: number, lat: number, lon: number, tags: Record<string, string> | null) => void, onWay: ((w: Way) => void) | null) {
  const deg = (off: number, v: number) => 1e-9 * (off + b.gran * v);
  const tags = (keys: number[], vals: number[]) => {
    if (!keys.length) return null;
    const t: Record<string, string> = {};
    for (let i = 0; i < keys.length; i++) t[b.strings[keys[i]]] = b.strings[vals[i]];
    return t;
  };
  const p = new Pbf(b.buf);
  for (const [start, end] of b.groups) {
    p.pos = start;
    p.readFields((tag, _o, q) => {
      if (tag === 2) {
        const d: Dense = { id: [], lat: [], lon: [], kv: [] };
        q.readFields((t, dd: Dense, r) => {
          if (t === 1) r.readPackedSVarint(dd.id);
          else if (t === 8) r.readPackedSVarint(dd.lat);
          else if (t === 9) r.readPackedSVarint(dd.lon);
          else if (t === 10) r.readPackedVarint(dd.kv);
        }, d, q.readVarint() + q.pos);
        let id = 0, lat = 0, lon = 0, k = 0;
        for (let i = 0; i < d.id.length; i++) {
          (id += d.id[i]), (lat += d.lat[i]), (lon += d.lon[i]);
          let t: Record<string, string> | null = null;
          if (d.kv.length) {
            while (d.kv[k] !== 0 && k < d.kv.length) {
              (t ??= {})[b.strings[d.kv[k]]] = b.strings[d.kv[k + 1]];
              k += 2;
            }
            k++;
          }
          onNode(id, deg(b.latOff, lat), deg(b.lonOff, lon), t);
        }
      } else if (tag === 1) {
        const n: Plain = { id: 0, keys: [], vals: [], lat: 0, lon: 0 };
        q.readFields((t, nn: Plain, r) => {
          if (t === 1) nn.id = r.readSVarint();
          else if (t === 2) r.readPackedVarint(nn.keys);
          else if (t === 3) r.readPackedVarint(nn.vals);
          else if (t === 8) nn.lat = r.readSVarint();
          else if (t === 9) nn.lon = r.readSVarint();
        }, n, q.readVarint() + q.pos);
        onNode(n.id, deg(b.latOff, n.lat), deg(b.lonOff, n.lon), tags(n.keys, n.vals));
      } else if (tag === 3 && onWay) {
        const w: Way = { id: 0, keys: [], vals: [], refs: [] };
        q.readFields((t, ww: Way, r) => {
          if (t === 1) ww.id = r.readVarint();
          else if (t === 2) r.readPackedVarint(ww.keys);
          else if (t === 3) r.readPackedVarint(ww.vals);
          else if (t === 8) r.readPackedSVarint(ww.refs);
        }, w, q.readVarint() + q.pos);
        for (let i = 1; i < w.refs.length; i++) w.refs[i] += w.refs[i - 1];
        onWay(w);
      }
    }, {}, end);
  }
}

/** The wanted nodes and ways of an extract, as Overpass `out geom` elements. */
export function readOsm(path: string, want: Want, progress?: (pass: number, mb: number) => void): OsmElement[] {
  const file = readFileSync(path);
  const out: OsmElement[] = [];
  const ways: { id: number; tags: Record<string, string>; refs: number[] }[] = [];
  const needed = new Set<number>();
  let n = 0;
  for (const b of blocks(file)) {
    walk(
      b,
      (id, lat, lon, tags) => {
        if (tags && want.node(tags) && want.inside(lat, lon)) out.push({ type: "node", id, lat, lon, tags });
      },
      (w) => {
        const tags: Record<string, string> = {};
        for (let i = 0; i < w.keys.length; i++) tags[b.strings[w.keys[i]]] = b.strings[w.vals[i]];
        if (!want.way(tags)) return;
        ways.push({ id: w.id, tags, refs: w.refs });
        for (const r of w.refs) needed.add(r);
      },
    );
    if (++n % 200 === 0) progress?.(1, (b.buf.length * n) / 1e6);
  }
  if (!ways.length) return out;
  const at = new Map<number, { lat: number; lon: number }>();
  for (const b of blocks(file)) walk(b, (id, lat, lon) => needed.has(id) && at.set(id, { lat, lon }), null);
  for (const w of ways) {
    const geometry = w.refs.map((r) => at.get(r)).filter((p): p is { lat: number; lon: number } => !!p);
    if (geometry.length >= 2 && geometry.some((p) => want.inside(p.lat, p.lon))) out.push({ type: "way", id: w.id, tags: w.tags, geometry });
  }
  return out;
}
