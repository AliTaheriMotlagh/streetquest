// Street Empire (the idle tycoon) and the step counter: the server settles the economy,
// refuses what you can't afford, never lets a double tap overspend, and caps steps by
// a believable walking cadence.
import { expect, test } from "@playwright/test";
import { expectOk, Player } from "../helpers";

type Empire = {
  state: { cash: number; biz: Record<string, { n: number; mgr?: boolean; at?: number | null }>; boostUntil: number };
  now: number;
  stepsToday: number;
  stepBank: number;
  rank: number;
};

test.describe("street empire", () => {
  test("a new empire: run a cycle, earn, buy more", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    const e0 = expectOk(await p.get<Empire>("/api/empire")).data as Empire;
    expect(e0.state.biz.cart.n).toBe(1);
    expect(e0.state.cash).toBeGreaterThan(4);
    // Tap the cart: one cycle runs and pays when it's done.
    expectOk(await p.post("/api/empire", { action: "run", biz: "cart" }));
    await new Promise((r) => setTimeout(r, 1300));
    const e1 = (await p.get<Empire>("/api/empire")).data;
    expect(e1.state.cash).toBeGreaterThan(e0.state.cash + 0.9);
    expect(e1.state.biz.cart.at ?? null).toBeNull();
    // Buy a second cart.
    const e2 = expectOk(await p.post<Empire>("/api/empire", { action: "buy", biz: "cart", count: 1 })).data as Empire;
    expect(e2.state.biz.cart.n).toBe(2);
    expect(e2.state.cash).toBeLessThan(e1.state.cash);
    await p.dispose();
  });

  test("can't spend cash you don't have — not even with a double tap", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    // ~5 cash buys exactly one more cart (4.28); three taps at once buy one.
    const results = await Promise.all([1, 2, 3].map(() => p.post("/api/empire", { action: "buy", biz: "cart", count: 1 })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const e = (await p.get<Empire>("/api/empire")).data;
    expect(e.state.biz.cart.n).toBe(2);
    expect(e.state.cash).toBeGreaterThanOrEqual(0);
    expect((await p.post("/api/empire", { action: "buy", biz: "bank", count: 1 })).status).toBe(400);
    expect((await p.post("/api/empire", { action: "hire", biz: "cart" })).status).toBe(400);
    expect((await p.post("/api/empire", { action: "upgrade", id: "vault1" })).status).toBe(400);
    expect((await p.post("/api/empire", { action: "prestige" })).status).toBe(400);
    expect((await p.post("/api/empire", { action: "dividend" })).status).toBe(400);
    expect((await p.post("/api/empire", { action: "rank" })).status).toBe(400);
    expect((await p.post("/api/empire", { action: "buy", biz: "nope", count: 1 })).status).toBe(400);
    await p.dispose();
  });
});

test.describe("steps", () => {
  test("motion steps are capped by cadence and feed the empire", async ({ baseURL }) => {
    const p = await Player.create(baseURL!);
    // A forged burst: the first report covers at most a minute of fast walking.
    const a = expectOk(await p.post<{ added: number; today: number }>("/api/steps", { steps: 50_000 })).data as { added: number; today: number };
    expect(a.added).toBeGreaterThan(0);
    expect(a.added).toBeLessThanOrEqual(220);
    // Right after, almost nothing more fits.
    const b = expectOk(await p.post<{ added: number; today: number }>("/api/steps", { steps: 5_000 })).data as { added: number; today: number };
    expect(b.added).toBeLessThanOrEqual(10);
    const s = (await p.get<{ today: number; total: number; week: { steps: number }[] }>("/api/steps")).data;
    expect(s.today).toBe(a.added + b.added);
    expect(s.total).toBe(s.today);
    expect(s.week).toHaveLength(7);
    // The empire sees today's steps (its income multiplier) and the step bank.
    const e = (await p.get<Empire>("/api/empire")).data;
    expect(e.stepsToday).toBe(s.today);
    expect(e.stepBank).toBe(s.total);
    // Not enough banked steps for a Step Rush yet.
    expect((await p.post("/api/empire", { action: "rush" })).status).toBe(400);
    expect((await p.post("/api/steps", { steps: -5 })).status).toBe(400);
    await p.dispose();
  });
});
