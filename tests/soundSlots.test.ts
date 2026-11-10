// Recorded sound slots: the manifest is read defensively (junk ignored), and every slot is sane.
import assert from "node:assert/strict";
import { it } from "node:test";
import { readManifest, slotFile, SOUND_KEYS, SOUND_SLOTS } from "@/lib/soundSlots";

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
