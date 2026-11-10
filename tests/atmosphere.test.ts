// The air's rules (lib/atmosphere.ts): haze, the sun's glow in it, heat shimmer, tyre smoke.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { airFor, tyreSmoke, type AirIn } from "@/lib/atmosphere";

const noon: AirIn = { night: 0, overcast: 0, rain: 0, sunHeight: 0.95 };

describe("haze", () => {
  it("is thicker at a low sun, in rain and under cloud than at a clear noon", () => {
    const base = airFor(noon).density;
    assert.ok(airFor({ ...noon, sunHeight: 0.1 }).density > base * 1.8);
    assert.ok(airFor({ ...noon, rain: 1 }).density > base * 1.6);
    assert.ok(airFor({ ...noon, overcast: 1 }).density > base);
  });
  it("glows towards the sun mostly when it is low, and not at night or under cloud", () => {
    assert.ok(airFor({ ...noon, sunHeight: 0.1 }).scatter > airFor(noon).scatter * 2);
    assert.equal(airFor({ ...noon, night: 1 }).scatter, 0);
    assert.ok(airFor({ ...noon, overcast: 1 }).scatter < airFor(noon).scatter * 0.3);
  });
  it("shimmers with heat only at a high, clear, dry midday", () => {
    assert.ok(airFor(noon).heat > 0.9);
    for (const i of [{ ...noon, sunHeight: 0.2 }, { ...noon, overcast: 1 }, { ...noon, rain: 1 }, { ...noon, night: 1 }]) assert.equal(airFor(i).heat, 0);
  });
  it("stays in range whatever it's fed", () => {
    for (const night of [-1, 0, 0.5, 1, 3]) for (const overcast of [-1, 0, 1, 4]) for (const rain of [0, 1, 5]) for (const sunHeight of [-1, 0, 0.5, 1, 2]) {
      const a = airFor({ night, overcast, rain, sunHeight });
      assert.ok(a.density > 0 && a.density < 0.004, `${a.density}`);
      assert.ok(a.scatter >= 0 && a.scatter <= 1.3 && a.heat >= 0 && a.heat <= 1);
    }
  });
});

describe("tyre smoke", () => {
  it("is none when crawling, coasting straight, or in the air", () => {
    assert.equal(tyreSmoke(3, 8, 20), 0);
    assert.equal(tyreSmoke(20, 0.5, 2), 0);
    assert.equal(tyreSmoke(30, 12, 20, false), 0);
  });
  it("grows with how far the car slides or how hard it brakes", () => {
    assert.ok(tyreSmoke(20, 5, 0) > 0 && tyreSmoke(20, 9, 0) > tyreSmoke(20, 5, 0));
    assert.equal(tyreSmoke(20, 40, 0), 1);
    assert.ok(tyreSmoke(25, 0, 12) > 0 && tyreSmoke(25, 0, 18) > tyreSmoke(25, 0, 12));
    assert.equal(tyreSmoke(25, -9, 0), tyreSmoke(25, 9, 0), "either way");
  });
  it("a hard stop from a crawl doesn't smoke", () => {
    assert.equal(tyreSmoke(7.5, 0, 25), tyreSmoke(7.5, 0, 25));
    assert.ok(tyreSmoke(7.5, 0, 25) < 0.15);
  });
});
