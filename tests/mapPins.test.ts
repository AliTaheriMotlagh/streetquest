// The map's one marker (lib/mapPins.ts) and the filter's presets (lib/mapPresets.ts): every pin is
// the same structure, safe to put in the page, and never depends on the zoom or on its name fitting
// (so markers keep their icon); a preset turns on exactly its topic and is recognised afterwards.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clusterFace, countText, esc, PIN_PX, pinClass, pinHtml, type PinSpec } from "@/lib/mapPins";
import { applyPreset, currentPreset, PRESETS } from "@/lib/mapPresets";
import { STORE_TYPE_KEYS } from "@/lib/stores/directory";

const spec: PinSpec = { family: "place", face: "☕", color: "#a0643c", label: "Café <b>", badge: { text: "−10%", kind: "deal" }, logo: "https://cdn.example/l.png", state: ["closed"] };

describe("pins", () => {
  it("one structure: disc, face, logo, badge, name — escaped", () => {
    const h = pinHtml(spec);
    assert.match(h, /^<span class="pin-b" style="--c:#a0643c"><span class="pin-f">☕<\/span><img class="pin-logo" src="https:\/\/cdn\.example\/l\.png"/);
    assert.match(h, /<span class="pin-badge deal">−10%<\/span>/);
    assert.match(h, /<span class="nm">Café &#60;b&#62;<\/span>$/);
    assert.equal(pinClass(spec), "pin pin-place closed");
  });
  it("never lets a bad colour, logo or face break the page", () => {
    const h = pinHtml({ family: "place", face: '"><script>', color: "red;}body{x", logo: "javascript:alert(1)" });
    assert.ok(!h.includes("<script>") && !h.includes("javascript:") && !h.includes("red;"));
    assert.match(h, /--c:#6b7280/);
    assert.equal(esc(`a&"'`), "a&#38;&#34;&#39;");
  });
  it("is the same HTML whatever the zoom or crowding (no lod, no nolabel in it)", () => {
    const h = pinHtml(spec);
    assert.ok(!/lod-|nolabel|is-dot/.test(h));
    assert.equal(pinHtml(spec), h);
  });
  it("one size per zoom level, smaller further out", () => {
    assert.ok(PIN_PX.near > PIN_PX.mid && PIN_PX.mid > PIN_PX.far);
  });
  it("a bubble shows its most common face and 99+ past 99", () => {
    assert.equal(clusterFace(["☕", "🍕", "☕"]), "☕");
    assert.equal(clusterFace([]), "📍");
    assert.equal(countText(7), "7");
    assert.equal(countText(250), "99+");
  });
});

describe("filter presets", () => {
  const ALL = ["money", "jobs", "players", "biz", "food", "cafe", "sweets", "market", "places", "torob", "cinema", "deals", "divar", "traffic", "siktir", "dir-bilbooard", "dir-irangaah", "dir-okala", "dir-netbarg", "dir-sheypoor"];
  it("everything / just the game", () => {
    assert.deepEqual(applyPreset("all", ALL), { layers: ALL, hiddenTypes: [], hiddenKinds: [] });
    assert.deepEqual(applyPreset("game", ALL).layers, ["money", "jobs", "players", "biz"]);
  });
  it("a topic keeps the game on, turns on its layers and narrows the stores", () => {
    const health = applyPreset("health", ALL);
    assert.ok(["money", "jobs", "players", "places", "dir-irangaah"].every((k) => health.layers.includes(k)));
    assert.ok(!health.layers.includes("cinema") && !health.layers.includes("food"));
    assert.deepEqual(STORE_TYPE_KEYS.filter((k) => !health.hiddenTypes.includes(k)).sort(), ["doctor", "health", "pharmacy"]);
    assert.ok(!health.hiddenKinds.includes("pharmacy") && health.hiddenKinds.includes("pizza"));
    const fun = applyPreset("fun", ALL);
    assert.ok(fun.layers.includes("cinema") && fun.layers.includes("deals"));
  });
  it("only names layers the map has", () => {
    assert.deepEqual(applyPreset("shopping", ["money", "torob"]).layers, ["money", "torob"]);
  });
  it("recognises the preset the choice is, and nothing after a change", () => {
    for (const p of PRESETS) {
      const x = applyPreset(p.id, ALL);
      assert.equal(currentPreset(x.layers, x.hiddenTypes, x.hiddenKinds, ALL), p.id);
    }
    const food = applyPreset("food", ALL);
    assert.equal(currentPreset(food.layers.filter((k) => k !== "deals"), food.hiddenTypes, food.hiddenKinds, ALL), null);
  });
});
