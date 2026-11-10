// The open city's crime and crashes: what a crash costs a car, how a car burns and blows
// up, and how the police heat builds up, gets lost and ends in an arrest.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blastOnCar, blastOnPerson, BLAST_R, BURN_S, burnCar, CAR_HP, carLook, crashDamage, crumple, DENT_MAX, dentCar, holeCar, HOLES_MAX, localShot, dentDepth, enginePower, freshCar, hurtCar, localHit, SCRAPE_MS } from "@/lib/street/damage";
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

describe("dents on the cars in traffic", () => {
  const len = 4.4, wid = 1.75;
  it("a hit lands on the car's outline, in its own frame (the nose at −z)", () => {
    // Facing north (yaw 0: forward is −z), hit from in front: the middle of the nose.
    const front = localHit(0, 0, 0, 0, -10, len, wid);
    assert.ok(Math.abs(front.x) < 1e-9 && Math.abs(front.z + len / 2) < 1e-9);
    // Turned to face west (yaw π/2: forward is −x), hit from the west: still its nose.
    const west = localHit(5, 5, Math.PI / 2, -5, 5, len, wid);
    assert.ok(Math.abs(west.x) < 1e-6 && Math.abs(west.z + len / 2) < 1e-6, JSON.stringify(west));
    // A side hit lands on the side, not past it.
    const side = localHit(0, 0, 0, 3, 0.4, len, wid);
    assert.ok(Math.abs(side.x - wid / 2) < 1e-9 && Math.abs(side.z) < len / 2);
    // Right on top of the car: the nose (somewhere to fold).
    assert.deepEqual(localHit(1, 1, 0.3, 1, 1, len, wid), { x: 0, z: -len / 2 });
  });

  it("the same spot hit again goes deeper (never past the most), a harder hit elsewhere moves it", () => {
    const c = freshCar();
    assert.equal(dentCar(c, { x: 0, z: -2.2 }, 0.001), undefined, "a tap leaves nothing");
    dentCar(c, { x: 0, z: -2.2 }, 0.15);
    assert.equal(c.dent?.depth, 0.15);
    dentCar(c, { x: 0.3, z: -2.2 }, 0.15);
    assert.ok(c.dent!.depth > 0.15 && c.dent!.x > 0 && c.dent!.x < 0.3);
    for (let i = 0; i < 20; i++) dentCar(c, { x: 0, z: -2.2 }, 0.3);
    assert.equal(c.dent!.depth, DENT_MAX);
    // A lighter hit on the other end doesn't move it; a deeper one would, but none is deeper now.
    dentCar(c, { x: 0, z: 2.2 }, 0.1);
    assert.equal(c.dent!.z < 0, true);
    const d = freshCar();
    dentCar(d, { x: 0, z: 2.2 }, 0.05);
    dentCar(d, { x: 0.87, z: 0 }, 0.2);
    assert.deepEqual([d.dent!.x, d.dent!.z], [0.87, 0]);
  });

  it("the whole body looks more battered the less health it has", () => {
    const c = freshCar();
    assert.equal(crumple(c), 0);
    hurtCar(c, CAR_HP / 2);
    assert.equal(crumple(c), 0.5);
    c.exploded = true;
    assert.equal(crumple(c), 1);
    assert.equal(dentCar(c, { x: 0, z: 0 }, 0.3), undefined, "a burnt-out shell isn't dented further");
  });
});

describe("bullet holes", () => {
  it("a shot lands on the car's outline at the height it hit (between the sills and the roof), the last few kept", () => {
    const h = localShot(0, 0, 0, 3, 0.9, 0.2, 4.4, 1.75, 1.45);
    assert.ok(Math.abs(h.x - 0.875) < 1e-9 && h.y === 0.9);
    assert.equal(localShot(0, 0, 0, 3, 5, 0, 4.4, 1.75, 1.45).y, 1.4, "over the roof: on the roof line");
    const c = freshCar();
    for (let i = 0; i < HOLES_MAX + 3; i++) holeCar(c, { x: i, y: 1, z: 0 });
    assert.equal(c.holes!.length, HOLES_MAX);
    assert.equal(c.holes![0].x, 3, "the oldest went first");
    c.exploded = true;
    holeCar(c, { x: 99, y: 1, z: 0 });
    assert.equal(c.holes!.length, HOLES_MAX, "a burnt-out shell takes no more");
  });
});
