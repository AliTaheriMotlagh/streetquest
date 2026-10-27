// The 3D city's worker: everything heavy happens here, off the main thread.
//  - { kind: "vt", x, y, locale }: download one zoom-14 street-map tile (through our
//    /api/vt proxy, straight from OpenFreeMap if that fails) and slice it into cells.
//  - { kind: "build", tile, origin, style, lite }: turn one cell into mesh arrays
//    (tileMesh.ts), buffers transferred back without copying.
import { buildTileArrays, transferables, type Style } from "./tileMesh";
import { sliceVectorTile, VT_ZOOM } from "./vectorTile";
import type { CityTile } from "@/lib/city";
import type { LatLng } from "@/lib/geo";

type Job =
  | { id: number; kind: "build"; tile: CityTile; origin: LatLng; style: Style; lite: boolean }
  | { id: number; kind: "vt"; x: number; y: number; locale: string; infill: boolean };

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

let direct: string | null = null;
async function fetchTile(x: number, y: number): Promise<ArrayBuffer | null> {
  const viaUs = await fetch(`${self.location.origin}/api/vt/${VT_ZOOM}/${x}/${y}`).catch(() => null);
  if (viaUs?.status === 204) return null;
  if (viaUs?.ok) return viaUs.arrayBuffer();
  // Our proxy is down: ask the map host directly.
  if (!direct) {
    const tj = await fetch("https://tiles.openfreemap.org/planet").then((r) => r.json() as Promise<{ tiles?: string[] }>);
    direct = tj.tiles?.[0] ?? null;
    if (!direct) throw new Error("no tile source");
  }
  const res = await fetch(direct.replace("{z}", String(VT_ZOOM)).replace("{x}", String(x)).replace("{y}", String(y)));
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`tile ${res.status}`);
  return res.arrayBuffer();
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const job = e.data;
  try {
    if (job.kind === "vt") {
      const buf = await fetchTile(job.x, job.y);
      const cells = buf ? sliceVectorTile(buf, job.x, job.y, job.locale, { infill: job.infill }) : [];
      post({ id: job.id, cells, empty: !buf });
      return;
    }
    const arrays = buildTileArrays(job.tile, job.origin, job.style, job.lite);
    post({ id: job.id, arrays }, transferables(arrays));
  } catch (err) {
    post({ id: job.id, error: String(err) });
  }
};
