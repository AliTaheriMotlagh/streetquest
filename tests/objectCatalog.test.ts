// The object catalog reads the game's registries instead of keeping lists of its own.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAR_MODELS } from "@/lib/carModels";
import { FLEET } from "@/lib/fleet";
import { ITEMS } from "@/lib/catalog";
import { PEOPLE_MODELS } from "@/lib/peopleModels";
import { PROP_MODELS } from "@/lib/propModels";
import { WEAPON_KEYS } from "@/lib/arena/weapons";
import { PLACE_CATS } from "@/lib/places";
import { buildCatalog, buildSlots, builtinFiles } from "@/lib/objectCatalog";

describe("objectCatalog", () => {
  const cat = buildCatalog({ landmarks: [{ id: "abc", name: "Kebab house", url: "/landmark/abc/1.glb", height: 9, stats: { triangles: 5000, bytes: 90000 } }] });
  const of = (k: string) => cat.filter((o) => o.kind === k);
  it("has every fleet kind, person, weapon, prop, item and store kind exactly once", () => {
    assert.equal(of("car").length, Object.keys(FLEET).length);
    assert.equal(of("person").length, PEOPLE_MODELS.length);
    assert.equal(of("weapon").length, WEAPON_KEYS.length);
    assert.equal(of("prop").length, Object.keys(PROP_MODELS.kinds).length);
    assert.equal(of("loot").length, ITEMS.length);
    assert.equal(of("store").length, Object.keys(PLACE_CATS).length);
    assert.equal(of("landmark").length, 1);
    assert.equal(new Set(cat.map((o) => o.id)).size, cat.length);
  });
  it("car models carry the registry's file, bytes and credit", () => {
    for (const m of Object.values(CAR_MODELS)) {
      const o = cat.find((x) => x.id === `car:${m!.key}`)!;
      assert.equal(o.file, m!.file);
      assert.equal(o.credits[0].license, m!.credit.license);
    }
  });
  it("slots group the objects that share a file", () => {
    const slots = buildSlots(cat);
    assert.equal(slots.find((s) => s.slot === "arena:weapons")!.objects.length, WEAPON_KEYS.length);
    assert.ok(builtinFiles().every((f) => slots.some((s) => s.file === f)));
  });
});
