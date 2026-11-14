// Play from home: "back to my real location" may jump past the travel speed cap — once in a while.
import { expect, test } from "@playwright/test";
import { expectOk, offset, Player, randomSpot } from "../helpers";

test("from home, a real-location reset jumps far once, then the speed cap holds again", async ({ baseURL }) => {
  const p = await Player.create(baseURL!);
  expectOk(await p.post("/api/me", { remotePlay: true }, "PATCH"));
  const here = randomSpot();
  expectOk(await p.post("/api/loc", here));
  const far = offset(here, 40_000);
  // A plain jump 40 km away: faster than any vehicle — refused.
  expect((await p.post("/api/loc", far)).status).toBe(409);
  // The same jump as a real-location reset: accepted (locally there's no IP location to check it against).
  expectOk(await p.post("/api/loc", { ...far, real: true }));
  // A second reset straight away: the cap holds.
  expect((await p.post("/api/loc", { ...here, real: true })).status).toBe(409);
});
