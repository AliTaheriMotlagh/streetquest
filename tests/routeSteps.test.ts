import { test } from "node:test";
import assert from "node:assert/strict";
import { stepText, turnOf } from "../src/lib/routeSteps";

test("OSRM maneuvers become turns", () => {
  assert.equal(turnOf("depart", "right"), "depart");
  assert.equal(turnOf("turn", "left"), "left");
  assert.equal(turnOf("end of road", "right"), "right");
  assert.equal(turnOf("turn", "slight right"), "slight-right");
  assert.equal(turnOf("fork", "slight left"), "fork-left");
  assert.equal(turnOf("rotary", "right"), "roundabout");
  assert.equal(turnOf("off ramp", "right"), "exit");
  assert.equal(turnOf("arrive"), "arrive");
});

test("a road that only changes its name going straight isn't said", () => {
  assert.equal(turnOf("new name", "straight"), null);
  assert.equal(turnOf("continue", undefined), null);
  assert.equal(turnOf("new name", "left"), "left");
});

test("step text: what to do, then the road", () => {
  assert.equal(stepText({ turn: "left", name: "Valiasr", text: "", distanceM: 10, at: [0, 0] }), "Turn left · Valiasr");
  assert.equal(stepText({ turn: "roundabout", exit: 2, name: "", text: "", distanceM: 10, at: [0, 0] }), "At the roundabout, take exit 2");
  assert.equal(stepText({ turn: "arrive", name: "X", text: "", distanceM: 0, at: [0, 0] }), "You've arrived");
  assert.equal(stepText({ text: "old words", name: "", distanceM: 0, at: [0, 0] }), "old words");
});
