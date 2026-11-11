// Siktir: "never again" marks on places — one per player per place, changeable and undoable,
// aggregated by place and by map box, rate limited, and moderated by an admin.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, offset, Player, randomSpot } from "../helpers";

type Place = { key: string; count: number; reasons: Record<string, number>; top: string[]; mine: { reason: string; note: string } | null };
type Spots = { spots: { key: string; lat: number; lng: number; count: number; name: string; top: string[]; placeKey: string | null }[] };

const del = async (p: Player, q: string) => {
  const r = await p.ctx.fetch(`/api/siktir?${q}`, { method: "DELETE" });
  return { status: r.status(), data: (await r.json()) as Place };
};

test.describe("Siktir", () => {
  test("mark, change, aggregate, undo", async ({ baseURL }) => {
    const at = randomSpot();
    const [a, b] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!)]);
    const key = `e2e-${Date.now()}`;
    const mark = { ...at, placeKey: key, placeName: "Bad Kebab", reason: "dirty", note: "  sticky   tables " };

    expect((await a.get<Place>(`/api/siktir?placeKey=${key}`)).data.count).toBe(0);
    const first = await a.post<Place>("/api/siktir", mark);
    expect(first.status).toBe(200);
    expect(first.data.count).toBe(1);
    expect(first.data.mine).toEqual({ reason: "dirty", note: "sticky tables" });

    // One per player per place: marking again changes it.
    const again = await a.post<Place>("/api/siktir", { ...mark, reason: "rude", note: "" });
    expect(again.data.count).toBe(1);
    expect(again.data.reasons).toEqual({ rude: 1 });

    expectOk(await b.post("/api/siktir", { ...mark, reason: "rude" }));
    const sum = (await b.get<Place>(`/api/siktir?placeKey=${key}`)).data;
    expect(sum.count).toBe(2);
    expect(sum.top[0]).toBe("rude");
    // Players never see who.
    expect(JSON.stringify(sum)).not.toContain(a.username);

    // The map box sees it, aggregated.
    const box = (await b.get<Spots>(`/api/siktir?minLat=${at.lat - 0.01}&maxLat=${at.lat + 0.01}&minLng=${at.lng - 0.01}&maxLng=${at.lng + 0.01}`)).data;
    const spot = box.spots.find((s) => s.placeKey === key);
    expect(spot?.count).toBe(2);
    expect(spot?.name).toBe("Bad Kebab");
    expect((await b.get(`/api/siktir?minLat=0&maxLat=10&minLng=0&maxLng=10`)).status).toBe(400); // too wide

    // A spot with no store id is told apart by its (rounded) coordinates.
    const spotOnly = offset(at, 500);
    expect((await a.post<Place>("/api/siktir", { ...spotOnly, reason: "unsafe" })).data.count).toBe(1);
    expect((await b.get<Place>(`/api/siktir?lat=${spotOnly.lat}&lng=${spotOnly.lng}`)).data.count).toBe(1);

    // Undo.
    const gone = await del(a, `placeKey=${key}`);
    expect(gone.data.count).toBe(1);
    expect(gone.data.mine).toBeNull();
    await Promise.all([a.dispose(), b.dispose()]);
  });

  test("validation and rate limit", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const at = randomSpot();
    expect((await p.post("/api/siktir", { ...at, reason: "nope" })).status).toBe(400);
    expect((await p.post("/api/siktir", { ...at, reason: "scam", note: "x".repeat(281) })).status).toBe(400);
    expect((await p.post("/api/siktir", { lat: 123, lng: 0, reason: "scam" })).status).toBe(400);
    // A few an hour, then "slow down" — editing a mark you made is still fine.
    let last = 200;
    for (let i = 0; i < 12 && last === 200; i++) last = (await p.post("/api/siktir", { ...offset(at, i * 100), placeKey: `rl-${Date.now()}-${i}`, reason: "noisy" })).status;
    expect(last).toBe(429);
    await p.dispose();
  });

  test("admin lists marks, hides one (it stops counting) and deletes it", async ({ baseURL }) => {
    const at = randomSpot();
    const [admin, a, b] = await Promise.all([adminPlayer(baseURL!), Player.create(baseURL!), Player.create(baseURL!)]);
    const key = `mod-${Date.now()}`;
    expectOk(await a.post("/api/siktir", { ...at, placeKey: key, placeName: "Spam Place", reason: "scam", note: "buy my coins" }));
    expectOk(await b.post("/api/siktir", { ...at, placeKey: key, placeName: "Spam Place", reason: "dirty" }));

    expect((await a.get("/api/admin/siktir")).status).toBe(403);
    const list = (await admin.get<{ marks: { id: string; user: string; placeKey: string | null; hidden: boolean; spotCount: number }[] }>("/api/admin/siktir?q=Spam Place")).data.marks;
    const mine = list.find((m) => m.user === a.username)!;
    expect(mine).toBeTruthy();
    expect(mine.spotCount).toBe(2);

    expectOk(await admin.post("/api/admin/siktir", { action: "hide", id: mine.id }));
    expect((await b.get<Place>(`/api/siktir?placeKey=${key}`)).data.count).toBe(1);
    // The author editing a hidden mark doesn't bring it back.
    expectOk(await a.post("/api/siktir", { ...at, placeKey: key, placeName: "Spam Place", reason: "scam", note: "again" }));
    expect((await b.get<Place>(`/api/siktir?placeKey=${key}`)).data.count).toBe(1);

    expectOk(await admin.post("/api/admin/siktir", { action: "unhide", id: mine.id }));
    expect((await b.get<Place>(`/api/siktir?placeKey=${key}`)).data.count).toBe(2);
    expectOk(await admin.post("/api/admin/siktir", { action: "delete", id: mine.id }));
    expect((await b.get<Place>(`/api/siktir?placeKey=${key}`)).data.count).toBe(1);
    await Promise.all([admin.dispose(), a.dispose(), b.dispose()]);
  });
});
