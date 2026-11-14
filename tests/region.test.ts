import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countryAt, langAt, mapSearch, wordsAt } from "@/lib/region";

describe("where a store is, as far as words go", () => {
  it("tells the cities apart", () => {
    const at: [string, number, number, string][] = [
      ["Tehran", 35.6892, 51.389, "IR"], ["Tabriz", 38.08, 46.29, "IR"], ["Ahvaz", 31.32, 48.67, "IR"], ["Kermanshah", 34.31, 47.07, "IR"],
      ["Istanbul", 41.0082, 28.9784, "TR"], ["Van", 38.5, 43.38, "TR"], ["Basra", 30.51, 47.81, "IQ"], ["Baghdad", 33.31, 44.36, "IQ"], ["Erbil", 36.19, 44.01, "IQ"], ["Sulaymaniyah", 35.56, 45.43, "IQ"], ["Urmia", 37.55, 45.07, "IR"], ["Baneh", 35.99, 45.88, "IR"], ["Ilam", 33.64, 46.42, "IR"],
      ["Dubai", 25.2, 55.27, "AE"], ["Baku", 40.41, 49.87, "AZ"], ["Yerevan", 40.18, 44.51, "AM"], ["Herat", 34.35, 62.2, "AF"], ["Mashhad", 36.3, 59.6, "IR"], ["Taybad", 34.74, 60.78, "IR"], ["Sarakhs", 36.53, 61.16, "IR"], ["Zabol", 31.03, 61.5, "IR"],
      ["Berlin", 52.52, 13.4, "DE"], ["London", 51.5, -0.12, "GB"], ["Toronto", 43.65, -79.38, "US"], ["Tokyo", 35.68, 139.69, "OTHER"],
    ];
    for (const [name, lat, lng, c] of at) assert.equal(countryAt(lat, lng), c, name);
  });
  it("searches in the local language: «menü» in Istanbul, «منو» in Tehran, English elsewhere", () => {
    assert.equal(wordsAt({ lat: 41.0082, lng: 28.9784 }).menu, "menü");
    assert.equal(wordsAt({ lat: 41.0082, lng: 28.9784 }).phone, "telefon");
    assert.equal(wordsAt({ lat: 35.6892, lng: 51.389 }).phone, "تلفن");
    assert.equal(wordsAt({ lat: 35.68, lng: 139.69 }).menu, "menu");
    assert.equal(langAt(52.52, 13.4), "de");
  });
  it("looks a place up on Balad in Iran, on Google Maps elsewhere", () => {
    assert.equal(mapSearch("Kebapçı", { lat: 41.0082, lng: 28.9784 }).site, "google");
    assert.ok(mapSearch("Kebapçı", { lat: 41.0082, lng: 28.9784 }).url.includes("@41.00820,28.97840"));
    assert.equal(mapSearch("کبابی", { lat: 35.6892, lng: 51.389 }).site, "balad");
  });
});
