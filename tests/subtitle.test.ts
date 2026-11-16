import assert from "node:assert/strict";
import { test } from "node:test";
import { revealWords } from "../src/lib/street/subtitle";

test("subtitles show whole words, more as the voice goes on, all of it at the end", () => {
  const s = "سلام، حالت چطوره؟ امروز هوا خیلی خوبه";
  assert.equal(revealWords(s, 0), "");
  assert.equal(revealWords(s, 1), s);
  let last = 0;
  for (let k = 0.05; k < 1; k += 0.05) {
    const r = revealWords(s, k);
    assert.ok(s.startsWith(r), "a prefix of the line");
    assert.ok(r === "" || s.length === r.length || /\s/.test(s[r.length]), "ends on a whole word");
    assert.ok(r.length >= last, "never goes back");
    last = r.length;
  }
  assert.ok(revealWords(s, 0.5).length > 0 && revealWords(s, 0.5).length < s.length);
});
