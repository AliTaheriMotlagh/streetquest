// Recorded sound slots: the manifest is read defensively (junk ignored), and every slot is sane.
import assert from "node:assert/strict";
import { it } from "node:test";
import { readManifest, SHIP_LICENSE, slotFile, SOUND_KEYS, SOUND_SLOTS } from "@/lib/soundSlots";

it("sound manifest: only real slots with safe file names", () => {
  assert.deepEqual(readManifest(null), {});
  assert.deepEqual(readManifest({ siren: ["siren-1.mp3"], nope: ["x.mp3"], horn: ["../etc/passwd", "horn-1.mp3", 3], city: [] }), { siren: ["siren-1.mp3"], horn: ["horn-1.mp3"] });
  assert.equal(slotFile("crashHeavy", 0), "crashHeavy-1.mp3");
});

it("sound slots: every one has a search hint and a length; ambience and sirens loop", () => {
  for (const k of SOUND_KEYS) {
    const s = SOUND_SLOTS[k];
    assert.ok(s.search.length > 3 && s.maxS > 0, k);
  }
  assert.ok(SOUND_SLOTS.siren.loop && SOUND_SLOTS.city.loop && SOUND_SLOTS.city.stereo);
});

it("sound credits: only well-formed entries with https links", async () => {
  const { soundCredits } = await import("@/lib/soundSlots");
  const ok = { title: "Crash", author: "qubodup", url: "https://opengameart.org/content/crash-collision", license: "CC0" };
  assert.deepEqual(soundCredits({ credits: [ok, { title: "x" }, { ...ok, url: "javascript:alert(1)" }] }), [ok]);
  assert.deepEqual(soundCredits({}), []);
});

it("the shipped sound list: every source is a licence the game can ship, every take a real slot", async () => {
  const { readFileSync } = await import("node:fs");
  const list = JSON.parse(readFileSync("assets/sound-sources.json", "utf8")) as { sources: Record<string, { license: string; page: string }>; takes: { slot: string; layers: { src: string }[] }[] };
  for (const [id, s] of Object.entries(list.sources)) {
    assert.match(s.license, SHIP_LICENSE, id);
    // A source without a stated licence is credited with the page it came from.
    if (!/^(CC0|Public domain)$/.test(s.license)) assert.ok(s.page.length > 12, id);
    assert.match(s.page, /^https:\/\//, id);
  }
  for (const t of list.takes) {
    assert.ok((SOUND_KEYS as string[]).includes(t.slot), t.slot);
    for (const l of t.layers) assert.ok(list.sources[l.src.split("/")[0]], l.src);
  }
});
