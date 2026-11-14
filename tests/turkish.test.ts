import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fmtNum, LOCALES, pickLocale, resolveLocale } from "@/lib/i18n";
import { bigNum } from "@/lib/idle";
import { voiceLangOf } from "@/lib/street/voiceLang";

describe("Turkish", () => {
  it("is a language; a browser in Turkey listing Turkish gets it, a saved choice always wins", () => {
    assert.ok(LOCALES.includes("tr"));
    assert.equal(pickLocale("tr-TR,tr;q=0.9,en;q=0.8"), "tr");
    assert.equal(pickLocale("en-US,en;q=0.9,tr;q=0.5", "TR"), "tr");
    assert.equal(pickLocale("en-US,en;q=0.9,tr;q=0.5", "DE"), "en");
    assert.equal(resolveLocale("fa", "tr-TR", "TR"), "fa");
  });
  it("numbers the Turkish way, idle numbers with Turkish words", () => {
    assert.equal(fmtNum(12345.5, "tr"), "12.345,5");
    assert.match(bigNum(1_230_000, "tr", (x, o) => x.toLocaleString("tr-TR", o)), /^1,23 milyon$/);
  });
  it("people in Turkey speak Turkish whatever the game's language; a Turkish game speaks Turkish", () => {
    assert.equal(voiceLangOf("en", "TR"), "tr");
    assert.equal(voiceLangOf("tr"), "tr");
    assert.equal(voiceLangOf("fa", "IR"), "fa");
  });
});
