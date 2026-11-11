// Measures every built-in 3D model file (bytes, triangles, size, bones, clips) for the admin
// panel's Objects catalog: `npm run assets:catalog` writes src/lib/objectCatalog.generated.json.
// Which files exist comes from the registries (lib/objectCatalog.ts builtinFiles), never a list here.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { builtinFiles } from "../src/lib/objectCatalog";
import { inspectGlb } from "../src/lib/modelCheck";

const out: Record<string, unknown> = {};
for (const url of builtinFiles()) {
  const file = path.join("public", url);
  if (!existsSync(file)) {
    console.warn(`missing ${file} (skipped)`);
    continue;
  }
  const info = inspectGlb(new Uint8Array(readFileSync(file)));
  if ("error" in info) {
    console.warn(`${file}: ${info.error}`);
    continue;
  }
  const { nodes, ...rest } = info;
  out[url] = { ...rest, nodes: nodes.slice(0, 80) };
  console.log(`${url}  ${(info.bytes / 1024).toFixed(0)} KB  ${info.tris} tris  ${info.joints.length} bones  ${info.clips.length} clips`);
}
writeFileSync("src/lib/objectCatalog.generated.json", JSON.stringify(out, null, 1) + "\n");
