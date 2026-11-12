// While driving, the car's position reaches the 2D game every few seconds, not every second.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { offset } from "@/lib/geo";
import { commitDue, DRIVE_COMMIT_M, DRIVE_COMMIT_MS } from "@/lib/driveCommit";

describe("the car's position while driving", () => {
  const here = { lat: 35.7355, lng: 51.531 };
  it("the first one goes at once; then only after a while or a long way", () => {
    assert.ok(commitDue(null, here, 0));
    const last = { p: here, at: 1000 };
    assert.ok(!commitDue(last, offset(here, 40, 90), 2000), "a second and 40 m later: wait");
    assert.ok(commitDue(last, offset(here, 40, 90), 1000 + DRIVE_COMMIT_MS + 1), "a few seconds later: send");
    assert.ok(commitDue(last, offset(here, DRIVE_COMMIT_M + 10, 90), 1500), "far already: send");
  });
});
