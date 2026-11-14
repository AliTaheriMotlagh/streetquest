import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_VIEWS, layerShown, parseView } from "@/lib/appView";

describe("list, map and game views", () => {
  it("reads a saved view; anything else is the game (as before views existed)", () => {
    assert.equal(parseView("list"), "list");
    assert.equal(parseView("map"), "map");
    assert.equal(parseView(null), "game");
    assert.equal(parseView("shop"), "game");
    assert.deepEqual(APP_VIEWS.map((v) => v.key), ["list", "map", "game"]);
  });
  it("outside the game the map shows stores and places, never money, jobs, players or businesses", () => {
    for (const l of ["money", "jobs", "players", "biz"]) {
      assert.equal(layerShown("map", l), false, l);
      assert.equal(layerShown("game", l), true, l);
    }
    assert.equal(layerShown("map", "places"), true);
    assert.equal(layerShown("map", "torob"), true);
  });
});
