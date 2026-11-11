// Street jobs (lib/street/jobs.ts): the thief chase's clock and catch distances, what a
// getaway pays, and the claim key that limits one of a kind per window.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATCH_CAR_M, CATCH_FOOT_M, JOB_WINDOW_MS, jobClaimKey, jobReward, secsLeft, startThief, THIEF_GONE_M, THIEF_SECS, tickThief } from "@/lib/street/jobs";

describe("street jobs", () => {
  it("a thief is caught within arm's reach on foot, a little further at the wheel", () => {
    assert.equal(tickThief(startThief(1, 20), 0.1, CATCH_FOOT_M - 0.1, false), "caught");
    assert.equal(tickThief(startThief(1, 20), 0.1, CATCH_FOOT_M + 0.5, false), null);
    assert.equal(tickThief(startThief(1, 20), 0.1, CATCH_CAR_M - 0.1, true), "caught");
  });

  it("they get away when the clock runs out, when they're far ahead, or when they're gone", () => {
    const j = startThief(1, 20);
    assert.equal(tickThief(j, THIEF_SECS - 1, 15, false), null);
    assert.equal(secsLeft(j), 1);
    assert.equal(tickThief(j, 1, 15, false), "escaped");
    assert.equal(tickThief(startThief(1, 20), 0.1, THIEF_GONE_M, false), "escaped");
    assert.equal(tickThief(startThief(1, 20), 0.1, null, false), "escaped");
  });

  it("a getaway pays by the stars (two at least, five at most)", () => {
    assert.deepEqual(jobReward("getaway", 1), jobReward("getaway", 2));
    assert.ok(jobReward("getaway", 4).coins > jobReward("getaway", 2).coins);
    assert.deepEqual(jobReward("getaway", 9), jobReward("getaway", 5));
  });

  it("one claim key per kind per window", () => {
    const t0 = 10 * JOB_WINDOW_MS;
    assert.equal(jobClaimKey("thief", t0), jobClaimKey("thief", t0 + JOB_WINDOW_MS - 1));
    assert.notEqual(jobClaimKey("thief", t0), jobClaimKey("thief", t0 + JOB_WINDOW_MS));
    assert.notEqual(jobClaimKey("thief", t0), jobClaimKey("getaway", t0));
  });
});
