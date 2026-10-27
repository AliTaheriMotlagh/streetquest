// Real places: map tiles (uploaded by an admin here — the e2e server never calls
// OpenStreetMap), the jobs at real cafés and shops, visits and deliveries between them.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, offset, Player, randomSpot, uploadPlaces, type LatLng, type TestPlace } from "../helpers";

type Mission = { id: string; kind: "deliver" | "visit"; place: TestPlace; dest: (LatLng & { name: string }) | null; done: boolean; item: string | null; rewardXp: number };
type World = { places: (Mission & { toman: number })[]; businesses: unknown[] };

async function setup(baseURL: string) {
  const admin = await adminPlayer(baseURL);
  const spot = randomSpot();
  const tile = await uploadPlaces(admin, spot);
  const p = await Player.create(baseURL);
  const center = tile.places[0];
  await p.goTo(center);
  // Every job around (the map itself only shows the nearest few).
  const w = { places: (await p.get<{ missions: Mission[] }>(`/api/places?lat=${center.lat}&lng=${center.lng}`)).data.missions };
  return { admin, p, tile, w };
}

test.describe("real places", () => {
  test("tiles: admins upload, players read, nobody else writes", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const tile = await uploadPlaces(admin, randomSpot(), 4);
    const p = await Player.create(baseURL!);
    const r = await p.get<{ tile: { real: boolean; p: TestPlace[] } | null; pending: boolean }>(`/api/city?cx=${tile.cx}&cy=${tile.cy}`);
    expect(r.status).toBe(200);
    expect(r.data.pending).toBe(false);
    expect(r.data.tile?.real).toBe(true);
    expect(r.data.tile?.p.map((x) => x.name).sort()).toEqual(tile.places.map((x) => x.name).sort());
    // A cell with no data (and no fetching in tests) is simply empty: the client draws its village.
    const empty = await p.get<{ tile: unknown; pending: boolean }>(`/api/city?cx=${tile.cx + 7}&cy=${tile.cy + 7}`);
    expect(empty.data).toEqual({ tile: null, pending: false });
    expect((await p.get("/api/city?cx=abc&cy=1")).status).toBe(400);
    expect((await p.post("/api/city", { tile: { cx: 0, cy: 0, b: [], r: [], a: [], p: [] } })).status).toBe(403);
    await Promise.all([admin.dispose(), p.dispose()]);
  });

  test("every store has a job, with real drop-offs", async ({ baseURL }) => {
    const { admin, p, tile, w } = await setup(baseURL!);
    const ids = new Set(tile.places.map((x) => x.id));
    expect(new Set(w.places.map((m) => m.place.id)).size).toBe(tile.places.length);
    for (const m of w.places) {
      expect(ids.has(m.place.id)).toBe(true);
      if (m.kind === "deliver") {
        // The drop-off is another real place, not a random point.
        expect(tile.places.some((x) => x.name === m.dest?.name)).toBe(true);
        expect(m.dest?.name).not.toBe(m.place.name);
      } else expect(m.dest).toBeNull();
    }
    await Promise.all([admin.dispose(), p.dispose()]);
  });

  test("visit: only on the spot, once per window", async ({ baseURL }) => {
    const { admin, p, w } = await setup(baseURL!);
    const v = w.places.find((m) => m.kind === "visit");
    test.skip(!v, "no visit job rolled this window");
    await p.goTo(offset(v!.place, 400));
    const far = await p.post("/api/places", { id: v!.id });
    expect(far.status).toBe(400);
    await p.goTo(v!.place);
    const before = await p.me();
    const both = await Promise.all([p.post("/api/places", { id: v!.id }), p.post("/api/places", { id: v!.id })]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = await p.me();
    expect(after.xp).toBeGreaterThan(before.xp);
    expect(after.toman).toBe(0); // test mode never earns toman
    if (v!.item) expect(after.inventory.some((i) => i.key === v!.item)).toBe(true);
    // It's off the map now, and it's in the player's feed.
    const again = (await p.get<World>(`/api/world?lat=${v!.place.lat}&lng=${v!.place.lng}`)).data;
    expect(again.places.some((m) => m.id === v!.id)).toBe(false);
    const feed = await p.get<{ posts: { kind: string; place: { name: string } | null }[] }>("/api/social?tab=following");
    expect(feed.data.posts.some((x) => x.kind === "mission" && x.place?.name === v!.place.name)).toBe(true);
    // Forged ids are refused.
    expect((await p.post("/api/places", { id: v!.id.replace(/n\w+$/, "nfake") })).status).toBe(410);
    await Promise.all([admin.dispose(), p.dispose()]);
  });

  test("delivery: pick up at the place, finish at the real drop-off", async ({ baseURL }) => {
    const { admin, p, w } = await setup(baseURL!);
    const d = w.places.find((m) => m.kind === "deliver");
    test.skip(!d, "no delivery job rolled this window");
    await p.goTo(d!.place);
    const r = await p.post<{ run: { id: string; targetLat: number; targetLng: number } }>("/api/places", { id: d!.id });
    expectOk(r);
    const run = r.data.run;
    expect(run.targetLat).toBeCloseTo(d!.dest!.lat, 5);
    expect(run.targetLng).toBeCloseTo(d!.dest!.lng, 5);
    // Not there yet.
    expect((await p.post("/api/runs", { runId: run.id, action: "complete" })).status).toBe(400);
    await p.goTo(d!.dest!);
    const before = await p.me();
    expectOk(await p.post("/api/runs", { runId: run.id, action: "complete" }));
    const after = await p.me();
    expect(after.xp).toBeGreaterThan(before.xp);
    if (d!.item) expect(after.inventory.some((i) => i.key === d!.item)).toBe(true);
    await Promise.all([admin.dispose(), p.dispose()]);
  });

  test("a check-in on GPS pays toman", async ({ baseURL }) => {
    const { admin, p, w } = await setup(baseURL!);
    const v = w.places.find((m) => m.kind === "visit");
    test.skip(!v, "no visit job rolled this window");
    // A fresh player (setup moved in test mode): the first real fix is accepted anywhere.
    const q = await Player.create(baseURL!);
    expectOk(await q.post("/api/loc", { ...v!.place, acc: 8 }));
    const r = expectOk(await q.post<{ toman: number }>("/api/places", { id: v!.id }));
    expect(r.data.toman).toBe(10_000);
    expect((await q.me()).toman).toBe(10_000);
    await Promise.all([admin.dispose(), p.dispose(), q.dispose()]);
  });
});
