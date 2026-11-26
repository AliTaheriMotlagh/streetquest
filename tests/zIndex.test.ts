// The stacking scale (globals.css --z-*): every layer that floats over the page uses a token, so a
// dialog can't end up under a panel. Raw numbers are allowed only up to 20 — stacking inside one
// component — in the stylesheets and in inline styles alike.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const APP = join(process.cwd(), "src/app");
const LOCAL_MAX = 20;
const css = readdirSync(APP).filter((f) => f.endsWith(".css")).map((f) => ({ f, s: readFileSync(join(APP, f), "utf8") }));
const tokens = new Map<string, number>();
for (const m of css.find((c) => c.f === "globals.css")!.s.matchAll(/--(z-[a-z-]+):\s*(\d+);/g)) tokens.set(m[1], Number(m[2]));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("z-index scale", () => {
  it("the tokens are in the documented order", () => {
    const order = ["z-map", "z-raised", "z-panel", "z-float", "z-fx", "z-hud", "z-banner", "z-nav", "z-tray", "z-sheet", "z-pick", "z-loading", "z-screen", "z-modal", "z-picker", "z-prompt", "z-ad", "z-drive", "z-menu", "z-asks", "z-call", "z-celebrate", "z-popup", "z-dialog", "z-toast"];
    for (const k of order) assert.ok(tokens.has(k), `--${k} defined`);
    for (let i = 1; i < order.length; i++) assert.ok(tokens.get(order[i])! > tokens.get(order[i - 1])!, `--${order[i]} above --${order[i - 1]}`);
  });
  it("stylesheets use the tokens (raw numbers only for local stacking)", () => {
    const bad: string[] = [];
    for (const { f, s } of css)
      for (const m of s.matchAll(/z-index:\s*([^;}\n]+)/g)) {
        const v = m[1].trim();
        if (/var\(--z-[a-z-]+\)/.test(v) || v === "auto" || v === "inherit") continue;
        if (/^-?\d+$/.test(v) && Number(v) <= LOCAL_MAX) continue;
        bad.push(`${f}: z-index: ${v}`);
      }
    assert.deepEqual(bad, []);
  });
  it("every token used is defined", () => {
    const missing = new Set<string>();
    for (const { s } of css) for (const m of s.matchAll(/var\(--(z-[a-z-]+)\)/g)) if (!tokens.has(m[1])) missing.add(m[1]);
    for (const f of walk(join(process.cwd(), "src"))) for (const m of readFileSync(f, "utf8").matchAll(/var\(--(z-[a-z-]+)\)/g)) if (!tokens.has(m[1])) missing.add(m[1]);
    assert.deepEqual([...missing], []);
  });
  it("inline styles don't set raw z-indexes above local stacking", () => {
    const bad: string[] = [];
    for (const f of walk(join(process.cwd(), "src")))
      for (const m of readFileSync(f, "utf8").matchAll(/zIndex:\s*(\d+)/g)) if (Number(m[1]) > LOCAL_MAX) bad.push(`${f.replace(process.cwd() + "/", "")}: zIndex ${m[1]}`);
    assert.deepEqual(bad, []);
  });
});
