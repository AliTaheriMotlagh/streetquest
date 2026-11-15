import { test } from "node:test";
import assert from "node:assert/strict";
import { quietFor } from "../src/lib/quiet";

test("a test-driven browser hides guides and prompts", () => {
  assert.equal(quietFor({ webdriver: true }), true);
  assert.equal(quietFor({ webdriver: false, search: "?bench=map&quiet=1" }), true);
  assert.equal(quietFor({ webdriver: false, search: "?quiet=10" }), false);
  assert.equal(quietFor({ webdriver: false }), false);
});

test("sq_guides=1 brings the guides back (tests of the tour itself)", () => {
  assert.equal(quietFor({ webdriver: true, guides: "1" }), false);
});
