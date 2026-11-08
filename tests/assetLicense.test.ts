// Which Sketchfab models the game may ship (lib/assetLicense, scripts/sketchfab.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { licenseSlug, looksRipped, slugify, usableLicense } from "@/lib/assetLicense";

describe("model licenses", () => {
  it("takes CC BY and CC0 (by slug or by the label search results carry), nothing else", () => {
    assert.equal(usableLicense({ slug: "by" }), true);
    assert.equal(usableLicense({ label: "CC Attribution" }), true);
    assert.equal(usableLicense({ label: "CC0 Public Domain" }), true);
    for (const slug of ["by-nc", "by-nc-sa", "by-nd", "by-sa", "st", "ed"]) assert.equal(usableLicense({ slug }), false, slug);
    assert.equal(usableLicense({ label: "CC Attribution-NonCommercial" }), false);
    assert.equal(usableLicense(null), false);
    assert.equal(licenseSlug({ slug: "cc0", label: "whatever" }), "cc0");
  });

  it("skips models that name another game or call themselves rips", () => {
    for (const t of ["GTA V Banshee", "CS:GO AK-47 skin", "Call of Duty MW2 rifle", "counter-strike knife", "ripped from Tarkov", "pubg_helmet", "Fortnite character"]) assert.equal(looksRipped(t), true, t);
    for (const t of ["AK-47S low poly", "Tripod light", "Ripple water shader", "Persian sedan", "Assault rifle | game ready"]) assert.equal(looksRipped(t), false, t);
  });

  it("names files safely", () => {
    assert.equal(slugify("AKM | Free Lowpoly!"), "akm_free_lowpoly");
    assert.equal(slugify("   "), "model");
    assert.ok(slugify("x".repeat(200)).length <= 60);
  });
});
