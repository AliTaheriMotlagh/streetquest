// Renders every art-kit icon onto one contact sheet (HTML), for eyeballing the art:
//   npx tsx scripts/art-preview.ts out.html [filter]
import { writeFileSync } from "node:fs";
import { materialDefs, render } from "../src/components/art/kit";
import { ICONS } from "../src/components/art/icons";

const [out = "art-preview.html", only] = process.argv.slice(2);
const keys = Object.keys(ICONS).filter((k) => !only || only.split(",").includes(k));
const sym = keys.map((k) => `<symbol id="art-${k}" viewBox="0 0 64 64">${render(ICONS[k])}</symbol>`).join("");
const cells = keys
  .map((k) => `<div class="cell"><svg width="72" height="72"><use href="#art-${k}"/></svg><svg width="28" height="28"><use href="#art-${k}"/></svg><svg width="16" height="16"><use href="#art-${k}"/></svg><span>${k}</span></div>`)
  .join("");
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#12121f;font:11px system-ui;color:#9a9ab3;padding:12px}.g{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}.cell{background:#1b1b2e;border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;align-items:center;gap:6px}.cell span{width:100%}</style>
<svg width="0" height="0" style="position:absolute"><defs>${materialDefs()}</defs>${sym}</svg><div class="g">${cells}</div>`,
);
console.log(`${keys.length} icons → ${out}`);
