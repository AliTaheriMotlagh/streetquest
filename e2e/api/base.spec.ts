// Strategy layer: faction, base, construction, rush — the main coin and gem sinks.
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, fund, offset, Player, randomSpot } from "../helpers";

type BaseView = { faction: string | null; base: { id: string; buildings: { type: string; level: number; readyAt: string }[]; hp: number } | null; gems: number };

async function commander(baseURL: string, coins = 5000, gems = 0) {
  const admin = await adminPlayer(baseURL);
  const p = await Player.create(baseURL);
  const me = await p.me();
  await fund(admin, me.id, coins, gems);
  await admin.dispose();
  expectOk(await p.post("/api/base", { action: "faction", faction: "coalition" }));
  const spot = randomSpot();
  await p.goTo(spot);
  expectOk(await p.post("/api/base", { action: "found", name: "E2E Keep" }));
  return { p, spot };
}

const spent = (msg: string | undefined, sym: string) => Number(new RegExp(`−([\\d,]+) ?${sym}`).exec(msg ?? "")?.[1].replace(/,/g, "") ?? NaN);

test.describe("base & construction", () => {
  test("found a base where you stand; neighbours must keep their distance", async ({ baseURL }) => {
    const { p, spot } = await commander(baseURL!);
    const v = (await p.get<BaseView>("/api/base")).data;
    expect(v.faction).toBe("coalition");
    expect(v.base?.buildings.find((b) => b.type === "hq")?.level).toBe(1);

    const rival = await Player.create(baseURL!);
    expectOk(await rival.post("/api/base", { action: "faction", faction: "dragon" }));
    await rival.goTo(offset(spot, 20));
    const close = await rival.post("/api/base", { action: "found", name: "Too Close" });
    expect(close.status).toBe(400);
    expect(close.data.error).toMatch(/too close/i);
    await Promise.all([p.dispose(), rival.dispose()]);
  });

  test("double-tapped build charges once and builds once", async ({ baseURL }) => {
    const { p } = await commander(baseURL!);
    const before = (await p.me()).coins;
    const [a, b] = await Promise.all([p.post("/api/base", { action: "build", type: "power" }), p.post("/api/base", { action: "build", type: "power" })]);
    const ok = [a, b].filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    const refused = [a, b].find((r) => r.status !== 200)!;
    expect(refused.status).toBe(400);
    const cost = spent(ok[0].data.message, "🪙");
    expect(cost).toBeGreaterThan(0);
    expect((await p.me()).coins).toBe(before - cost);
    const power = (await p.get<BaseView>("/api/base")).data.base!.buildings.find((x) => x.type === "power")!;
    expect(power.level).toBe(1);
    await p.dispose();
  });

  test("can't pay again to 'upgrade' a building that's still under construction", async ({ baseURL }) => {
    const { p } = await commander(baseURL!);
    expectOk(await p.post("/api/base", { action: "build", type: "power" }));
    const coins = (await p.me()).coins;
    const again = await p.post("/api/base", { action: "build", type: "power" });
    expect(again.status).toBe(400);
    expect((await p.me()).coins).toBe(coins);
    await p.dispose();
  });

  test("rush finishes construction for gems, once", async ({ baseURL }) => {
    const { p } = await commander(baseURL!, 5000, 200);
    expectOk(await p.post("/api/base", { action: "build", type: "power" }));
    const gems = (await p.me()).gems;
    const [a, b] = await Promise.all([p.post("/api/base", { action: "rush", what: "build", type: "power" }), p.post("/api/base", { action: "rush", what: "build", type: "power" })]);
    const ok = [a, b].filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect((await p.me()).gems).toBe(gems - spent(ok[0].data.message, "gems"));
    const power = (await p.get<BaseView>("/api/base")).data.base!.buildings.find((x) => x.type === "power")!;
    expect(new Date(power.readyAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    await p.dispose();
  });

  test("nothing to repair or collect on a fresh base", async ({ baseURL }) => {
    const { p } = await commander(baseURL!);
    const coins = (await p.me()).coins;
    expect((await p.post("/api/base", { action: "repair" })).status).toBe(400);
    expect((await p.post("/api/base", { action: "collect" })).status).toBe(400);
    expect((await p.me()).coins).toBe(coins);
    await p.dispose();
  });

  test("defecting costs coins and is refused when you can't pay", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    expectOk(await p.post("/api/base", { action: "faction", faction: "dragon" }));
    const r = await p.post("/api/base", { action: "faction", faction: "insurgency" });
    expect(r.status).toBe(400);
    expect((await p.get<BaseView>("/api/base")).data.faction).toBe("dragon");
    await p.dispose();
  });

  test("actions without a base or faction explain what to do", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const noFaction = await p.post("/api/base", { action: "build", type: "power" });
    expect(noFaction.status).toBe(400);
    expect(noFaction.data.error).toMatch(/faction/i);
    expectOk(await p.post("/api/base", { action: "faction", faction: "dragon" }));
    const noBase = await p.post("/api/base", { action: "build", type: "power" });
    expect(noBase.status).toBe(400);
    expect(noBase.data.error).toMatch(/base/i);
    // No GPS fix yet: founding needs a recent position.
    const noFix = await p.post("/api/base", { action: "found", name: "Nowhere" });
    expect(noFix.status).toBe(400);
    expect(noFix.data.error).toMatch(/gps/i);
    await p.dispose();
  });
});
