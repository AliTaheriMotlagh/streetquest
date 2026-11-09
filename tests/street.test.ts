// The open city's crime and crashes: what a crash costs a car, how a car burns and blows
// up, and how the police heat builds up, gets lost and ends in an arrest.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blastOnCar, blastOnPerson, BLAST_R, BURN_S, burnCar, CAR_HP, carLook, crashDamage, dentDepth, enginePower, freshCar, hurtCar, SCRAPE_MS } from "@/lib/street/damage";
import { calm, CUFF_S, HEAT, loseAfter, MAX_STARS, report, response, starsFor, STAR_HEAT, tickWanted } from "@/lib/street/wanted";

const kmh = (v: number) => v / 3.6;

describe("crash damage", () => {
  it("a parking bump is free, a city crash dents, a fast one wrecks", () => {
    assert.equal(crashDamage(SCRAPE_MS - 0.1), 0);
    assert.equal(crashDamage(0), 0);
    const city = crashDamage(kmh(36)), mid = crashDamage(kmh(54)), fast = crashDamage(kmh(72)), wild = crashDamage(kmh(90));
    assert.ok(city > 8 && city < 30, `36 km/h costs ${city}`);
    assert.ok(mid > city * 1.8, "harder hits cost disproportionately more");
    assert.ok(fast > 55 && fast < CAR_HP, `72 km/h nearly wrecks it (${fast})`);
    assert.ok(wild >= CAR_HP, `90 km/h into a wall finishes it (${wild})`);
    assert.ok(crashDamage(kmh(54), 0.4) < mid, "a heavy vehicle takes less");
    assert.equal(crashDamage(-kmh(54)), mid, "backing into a wall counts the same");
  });

  it("dents grow with the hit and stop at a sensible depth", () => {
    assert.equal(dentDepth(1), 0);
    assert.ok(dentDepth(kmh(50)) > dentDepth(kmh(30)));
    assert.ok(dentDepth(100) <= 0.32);
  });

  it("looks the part: dented, smoking, black smoke, burning, wrecked", () => {
    assert.deepEqual([100, 60, 30, 10, 0].map((hp) => carLook(hp)), ["ok", "dented", "smoking", "black", "burning"]);
    assert.equal(carLook(50, true), "wrecked");
    assert.ok(enginePower(100) === 1 && enginePower(20) < 1 && enginePower(0) < enginePower(20), "a hurt engine pulls less");
  });

  it("a car at zero catches fire, burns for a while and then explodes, once", () => {
    const c = freshCar();
    assert.equal(hurtCar(c, 60), false);
    assert.equal(hurtCar(c, 60), true, "this hit set it alight");
    assert.equal(c.hp, 0);
    assert.equal(hurtCar(c, 10), false, "already burning");
    let boom = 0;
    for (let t = 0; t < BURN_S + 1; t += 0.1) if (burnCar(c, 0.1)) boom++;
    assert.equal(boom, 1);
    assert.ok(c.exploded);
    assert.equal(hurtCar(c, 50), false, "a wreck can't be hurt again");
  });

  it("a blast hurts what's close, throws it, and nothing past its reach", () => {
    assert.ok(blastOnCar(1).damage >= CAR_HP, "a car right beside it goes up too");
    assert.ok(blastOnCar(5).damage > 0 && blastOnCar(5).damage < blastOnCar(2).damage);
    assert.deepEqual(blastOnCar(BLAST_R + 1), { damage: 0, push: 0 });
    assert.ok(blastOnPerson(1).damage >= 100, "point blank kills");
    assert.equal(blastOnPerson(BLAST_R).damage, 0);
    assert.ok(blastOnPerson(3).push > blastOnPerson(6).push);
  });
});

describe("wanted level", () => {
  it("nobody saw it, nothing happened", () => {
    const w = calm();
    assert.equal(report(w, "killPerson", 0), 0);
    assert.equal(w.heat, 0);
  });

  it("a witnessed crime is a star, worse crimes and officers seeing them more", () => {
    const a = calm();
    assert.equal(report(a, "shots", 1), 1);
    const b = calm();
    report(b, "killPerson", 2);
    assert.ok(b.stars >= 2, "an officer watching a killing");
    const c = calm();
    report(c, "killCop", 2);
    assert.ok(c.stars >= 4, "killing an officer in front of another");
    assert.ok(HEAT.killCop > HEAT.hitCop && HEAT.hitCop > HEAT.killPerson && HEAT.killPerson > HEAT.shots);
  });

  it("stars follow the heat thresholds and never pass five", () => {
    for (let s = 1; s <= MAX_STARS; s++) assert.equal(starsFor(STAR_HEAT[s]), s);
    assert.equal(starsFor(STAR_HEAT[1] - 0.01), 0);
    const w = calm();
    for (let i = 0; i < 40; i++) report(w, "killCop", 2);
    assert.equal(w.stars, MAX_STARS);
  });

  it("out of sight long enough, they lose you — longer at more stars", () => {
    assert.ok(loseAfter(4) > loseAfter(1));
    const w = calm();
    report(w, "shots", 1);
    let out = null;
    let t = 0;
    for (; t < 60 && !out; t += 0.5) out = tickWanted(w, 0.5, false, false);
    assert.equal(out, "lost");
    assert.ok(Math.abs(t - loseAfter(1)) <= 0.5, `lost after ${t}s`);
    assert.equal(w.stars, 0);
  });

  it("an officer in sight keeps the chase on", () => {
    const w = calm();
    report(w, "hitPerson", 1);
    for (let t = 0; t < 60; t += 0.5) assert.equal(tickWanted(w, 0.5, true, false), null);
    assert.ok(w.stars >= 1);
  });

  it("stopped beside an officer for a moment, you're arrested; a step away lets the cuffs slip", () => {
    const w = calm();
    report(w, "shots", 1);
    assert.equal(tickWanted(w, CUFF_S * 0.6, true, true), null);
    tickWanted(w, 0.5, true, false);
    assert.equal(tickWanted(w, CUFF_S * 0.45, true, true), null, "the clock went back while you moved");
    assert.equal(tickWanted(w, CUFF_S, true, true), "busted");
    assert.equal(w.stars, 0);
  });

  it("the police come harder the more stars", () => {
    assert.deepEqual(response(0), { cars: 0, ram: false, shoot: false, shootCars: false });
    assert.equal(response(1).ram, false);
    assert.ok(response(2).ram && response(2).shoot && !response(2).shootCars);
    assert.ok(response(5).cars > response(3).cars && response(3).shootCars);
  });
});
