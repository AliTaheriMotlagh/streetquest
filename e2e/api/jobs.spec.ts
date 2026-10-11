// Jobs between players: ride hailing (fare escrow, PIN at pickup, both at the drop-off)
// and lotteries (buy on the spot, winner takes the whole pot, refunds when it can't run).
import { expect, test } from "@playwright/test";
import { adminPlayer, expectOk, fund, offset, Player, randomSpot } from "../helpers";

type Ride = { id: string; pin: string; status: string; fare: number };
type MyRides = { riding: Ride | null; driving: Omit<Ride, "pin"> | null };
type Lottery = { id: string; pot: number; status: string; winner: string | null; players: number; totalTickets: number; myTickets: number; won: boolean };

const rideBody = (from: { lat: number; lng: number }, to: { lat: number; lng: number }, fare: number) => ({
  pickupLabel: "Corner café",
  pickupLat: from.lat,
  pickupLng: from.lng,
  dropoffLabel: "Train station",
  dropoffLat: to.lat,
  dropoffLng: to.lng,
  fare,
});

test.describe("rides", () => {
  test("full ride: escrow, PIN at pickup, both at drop-off, driver paid once", async ({ baseURL }) => {
    const [rider, driver, rival] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!), Player.create(baseURL!)]);
    const from = randomSpot();
    const to = offset(from, 800, 300);
    await Promise.all([rider.goTo(from), driver.goTo(offset(from, 500)), rival.goTo(offset(from, 400))]);
    const r0 = await rider.me();

    const req = (expectOk(await rider.post("/api/rides", rideBody(from, to, 30))).data as { ride: Ride }).ride;
    expect((await rider.me()).coins).toBe(r0.coins - 30);
    // One ride at a time per rider.
    expect((await rider.post("/api/rides", rideBody(from, to, 30))).status).toBe(400);
    // The request shows on drivers' maps, without the PIN.
    const w = await driver.get<{ rides: (Ride & { pin?: string })[] }>(`/api/world?lat=${from.lat}&lng=${from.lng}`);
    const seen = w.data.rides.find((x) => x.id === req.id);
    expect(seen).toBeTruthy();
    expect(seen!.pin).toBeUndefined();

    // Two drivers tap accept at once: exactly one gets the rider.
    const [a, b] = await Promise.all([driver.post(`/api/rides/${req.id}`, { action: "accept" }), rival.post(`/api/rides/${req.id}`, { action: "accept" })]);
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    const winner = a.status === 200 ? driver : rival;
    const loser = winner === driver ? rival : driver;
    expect((await loser.post(`/api/rides/${req.id}`, { action: "start", pin: req.pin })).status).toBe(400);
    expect((await rider.post(`/api/rides/${req.id}`, { action: "accept" })).status).toBe(400);

    // Not at the pickup yet, then wrong PIN, then right PIN.
    const pin = (await rider.get<MyRides>("/api/rides")).data.riding!.pin;
    expect(pin).toBe(req.pin);
    expect((await winner.post(`/api/rides/${req.id}`, { action: "start", pin })).status).toBe(400);
    await winner.goTo(from);
    const wrong = await winner.post(`/api/rides/${req.id}`, { action: "start", pin: pin === "1111" ? "2222" : "1111" });
    expect(wrong.status).toBe(400);
    expect(wrong.data.error).toMatch(/PIN/);
    expectOk(await winner.post(`/api/rides/${req.id}`, { action: "start", pin }));
    // The driver never sees the PIN in their own view.
    expect((await winner.get<{ driving: Record<string, unknown> }>("/api/rides")).data.driving.pin).toBeUndefined();

    // Driver at the drop-off but the rider's phone isn't: refused.
    await winner.goTo(to);
    const early = await winner.post(`/api/rides/${req.id}`, { action: "complete" });
    expect(early.status).toBe(400);
    expect(early.data.error).toMatch(/rider/i);
    await rider.goTo(offset(to, 30));

    const before = (await winner.me()).coins;
    const [c1, c2] = await Promise.all([winner.post(`/api/rides/${req.id}`, { action: "complete" }), rider.post(`/api/rides/${req.id}`, { action: "arrive" })]);
    expect([c1.status, c2.status].filter((s) => s === 200)).toHaveLength(1);
    expect((await winner.me()).coins).toBe(before + 30);
    expect((await rider.get<MyRides>("/api/rides")).data.riding).toBeNull();
    // Escrow went to the driver, not back to the rider.
    expect((await rider.me()).coins).toBe(r0.coins - 30);
    await Promise.all([rider.dispose(), driver.dispose(), rival.dispose()]);
  });

  test("cancelling refunds the rider; a driver dropping puts the ride back in the queue", async ({ baseURL }) => {
    const [rider, driver] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!)]);
    const from = randomSpot();
    await Promise.all([rider.goTo(from), driver.goTo(from)]);
    const start = (await rider.me()).coins;
    expect((await rider.post("/api/rides", rideBody(from, offset(from, 500), start + 1))).status).toBe(400); // can't afford
    const tooShort = await rider.post("/api/rides", rideBody(from, offset(from, 10), 20));
    expect(tooShort.status).toBe(400);
    expect(tooShort.data.error).toMatch(/at least/);
    expect((await rider.me()).coins).toBe(start);
    const ride = (expectOk(await rider.post("/api/rides", rideBody(from, offset(from, 500), 20))).data as { ride: Ride }).ride;
    expectOk(await driver.post(`/api/rides/${ride.id}`, { action: "accept" }));
    expectOk(await driver.post(`/api/rides/${ride.id}`, { action: "cancel" }));
    const again = await driver.get<{ rides: Ride[] }>(`/api/world?lat=${from.lat}&lng=${from.lng}`);
    expect(again.data.rides.find((x) => x.id === ride.id)?.status).toBe("REQUESTED");
    // Double-tapped cancel refunds once.
    const res = await Promise.all([rider.post(`/api/rides/${ride.id}`, { action: "cancel" }), rider.post(`/api/rides/${ride.id}`, { action: "cancel" })]);
    expect(res.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await rider.me()).coins).toBe(start);
    await Promise.all([rider.dispose(), driver.dispose()]);
  });
});

test.describe("lottery", () => {
  test("buy on the spot only; winner takes the whole pot; coins are conserved", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const [host, p1, p2] = await Promise.all([Player.create(baseURL!), Player.create(baseURL!), Player.create(baseURL!)]);
    const spot = randomSpot();
    await Promise.all([host.goTo(spot), p1.goTo(offset(spot, 500)), p2.goTo(offset(spot, 20))]);
    const drawAt = new Date(Date.now() + 3_600_000).toISOString();
    expect((await host.post("/api/lotteries", { name: "Too soon", lat: spot.lat, lng: spot.lng, ticketPrice: 10, drawAt: new Date(Date.now() + 60_000).toISOString() })).status).toBe(400);
    const lot = (expectOk(await host.post("/api/lotteries", { name: "Corner Jackpot", lat: spot.lat, lng: spot.lng, ticketPrice: 10, maxTickets: 5, drawAt })).data as { lottery: { id: string } }).lottery;

    // p1 is 500 m away: can't buy from there.
    const far = await p1.post(`/api/lotteries/${lot.id}`, { action: "buy", qty: 1 });
    expect(far.status).toBe(400);
    expect(far.data.error).toMatch(/within/);
    await p1.goTo(spot);
    const [m1, m2] = await Promise.all([p1.me(), p2.me()]);

    expectOk(await p1.post(`/api/lotteries/${lot.id}`, { action: "buy", qty: 3 }));
    expectOk(await p2.post(`/api/lotteries/${lot.id}`, { action: "buy", qty: 2 }));
    // Per-player cap (5): 3 more would make 6 — refused and nothing charged.
    const over = await p1.post(`/api/lotteries/${lot.id}`, { action: "buy", qty: 3 });
    expect(over.status).toBe(400);
    expect((await p1.me()).coins).toBe(m1.coins - 30);
    // Host can't cancel once others bought in.
    expect((await host.post(`/api/lotteries/${lot.id}`, { action: "cancel" })).status).toBe(400);

    const view = (await p1.get<{ lotteries: Lottery[] }>(`/api/world?lat=${spot.lat}&lng=${spot.lng}`)).data.lotteries.find((l) => l.id === lot.id)!;
    expect(view).toMatchObject({ pot: 50, players: 2, totalTickets: 5, myTickets: 3 });

    expectOk(await admin.post("/api/admin", { action: "drawLottery", id: lot.id }));
    // Buying after the draw is refused.
    expect((await p2.post(`/api/lotteries/${lot.id}`, { action: "buy", qty: 1 })).status).toBe(400);

    const [a1, a2] = await Promise.all([p1.me(), p2.me()]);
    // Coins are conserved: everything paid in went to exactly one player.
    expect(a1.coins + a2.coins).toBe(m1.coins + m2.coins);
    const won = [a1.coins - (m1.coins - 30), a2.coins - (m2.coins - 20)];
    expect(won.sort()).toEqual([0, 50]);
    const done = (await p1.get<{ lotteries: Lottery[] }>("/api/lotteries")).data.lotteries.find((l) => l.id === lot.id)!;
    expect(done.status).toBe("DRAWN");
    expect([p1.username, p2.username]).toContain(done.winner);
    expect(done.won).toBe(done.winner === p1.username);
    await Promise.all([admin.dispose(), host.dispose(), p1.dispose(), p2.dispose()]);
  });

  test("a lottery with a single player refunds instead of drawing", async ({ baseURL }) => {
    const admin = await adminPlayer(baseURL!);
    const p = await Player.create(baseURL!);
    const me = await p.me();
    await fund(admin, me.id, 100);
    const spot = randomSpot();
    await p.goTo(spot);
    const lot = (expectOk(await p.post("/api/lotteries", { name: "Lonely Draw", lat: spot.lat, lng: spot.lng, ticketPrice: 25, drawAt: new Date(Date.now() + 3_600_000).toISOString() })).data as { lottery: { id: string } }).lottery;
    const before = (await p.me()).coins;
    expectOk(await p.post(`/api/lotteries/${lot.id}`, { action: "buy", qty: 2 }));
    expect((await p.me()).coins).toBe(before - 50);
    expectOk(await admin.post("/api/admin", { action: "drawLottery", id: lot.id }));
    expect((await p.me()).coins).toBe(before);
    const l = (await p.get<{ lotteries: Lottery[] }>("/api/lotteries")).data.lotteries.find((x) => x.id === lot.id)!;
    expect(l.status).toBe("REFUNDED");
    await Promise.all([admin.dispose(), p.dispose()]);
  });
});
