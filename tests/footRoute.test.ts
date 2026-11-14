// Walking routes (server/footRoute.ts): OSRM's answer read into a line along the streets, the
// same trip remembered, the profile chosen, and nothing when it fails.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("routes along the streets (OSRM)", () => {
  it("reads the polyline, asks the foot or car profile, remembers the trip, and gives up quietly", async () => {
    process.env.SITE_PACE = "off";
    const asked: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      asked.push(String(url));
      if (String(url).includes("41.1000")) return new Response("busy", { status: 503 });
      // "_p~iF~ps|U_ulLnnqC_mqNvxq`@" is the polyline example: (38.5,-120.2) (40.7,-120.95) (43.252,-126.453).
      return Response.json({ code: "Ok", routes: [{ geometry: "_p~iF~ps|U_ulLnnqC_mqNvxq`@", distance: 1234.4, duration: 900.2 }] });
    }) as typeof fetch;
    try {
      const { footRoute } = await import("@/server/footRoute");
      const a = { lat: 41.0369, lng: 28.985 }, b = { lat: 41.0082, lng: 28.9784 };
      const r = await footRoute(a, b);
      assert.deepEqual(r?.line[0], [38.5, -120.2]);
      assert.equal(r?.line.length, 3);
      assert.deepEqual([r?.distanceM, r?.durationS], [1234, 900]);
      assert.match(asked[0], /routed-foot\/route\/v1\/foot\/28\.985000,41\.036900;28\.978400,41\.008200/);
      await footRoute(a, b);
      assert.equal(asked.length, 1, "the same trip is remembered");
      await footRoute(a, b, "car");
      assert.match(asked[1], /routed-car\/route\/v1\/driving/);
      assert.equal(await footRoute({ lat: 41.1, lng: 29 }, b), null);
    } finally {
      globalThis.fetch = real;
    }
  });
});
