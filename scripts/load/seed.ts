// Load-test players: N throwaway accounts around one spot, each with a signed session,
// written to .load/players.json for scripts/load/scenarios.js (k6). Local databases only.
//
//   npm run load:seed -- --players 300 [--lat 35.7 --lng 51.39]
//   npm run load:clean          (deletes every lt_ account and what they made)
//
// The accounts play from home (remotePlay) and stand in the 3D city (DriveState), so the
// map, city and arena-relay endpoints all accept them. LOAD_ALLOW_REMOTE=1 lifts the
// local-only guard — never point this at the production database.
import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "../../src/lib/db";
import { signSession } from "../../src/server/session";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const PREFIX = "lt_";

function guard() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/?]+)/)?.[1] ?? "";
  if (!/^(localhost|127\.0\.0\.1|::1|db|postgres)$/.test(host) && process.env.LOAD_ALLOW_REMOTE !== "1") {
    console.error(`Refusing: the database host "${host}" isn't local (LOAD_ALLOW_REMOTE=1 to override).`);
    process.exit(1);
  }
}

async function clean() {
  const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return console.log("no load-test players");
  // Rows that point at the players without a cascade first.
  await prisma.arenaRoom.deleteMany({ where: { hostId: { in: ids } } });
  await prisma.driveState.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`deleted ${ids.length} load-test players`);
}

async function seed() {
  const n = Math.max(1, Math.min(5000, Number(arg("players", "200"))));
  const lat = Number(arg("lat", "35.7000")), lng = Number(arg("lng", "51.3900"));
  const out: { id: string; token: string; lat: number; lng: number }[] = [];
  for (let i = 0; i < n; i += 100) {
    const batch = Array.from({ length: Math.min(100, n - i) }, (_, k) => {
      const j = i + k;
      // Spread over ~2 km so the "nearby" queries see realistic crowds, not one pile.
      const p = { lat: lat + (Math.random() - 0.5) * 0.02, lng: lng + (Math.random() - 0.5) * 0.024 };
      return { username: `${PREFIX}${j}`, email: `${PREFIX}${j}@load.test`, passwordHash: "-", referralCode: `${PREFIX}${j}`, remotePlay: true, lastLat: p.lat, lastLng: p.lng, ...p };
    });
    await prisma.user.createMany({ data: batch.map(({ lat: _a, lng: _b, ...u }) => u), skipDuplicates: true });
    const rows = await prisma.user.findMany({ where: { username: { in: batch.map((b) => b.username) } }, select: { id: true, username: true } });
    const at = new Map(batch.map((b) => [b.username, b]));
    await prisma.driveState.createMany({
      data: rows.map((r) => {
        const { lat, lng } = at.get(r.username)!;
        return { userId: r.id, name: r.username, lat, lng, startLat: lat, startLng: lng };
      }),
      skipDuplicates: true,
    });
    for (const r of rows) out.push({ id: r.id, token: await signSession(r.id), lat: at.get(r.username)!.lat, lng: at.get(r.username)!.lng });
  }
  mkdirSync(".load", { recursive: true });
  writeFileSync(".load/players.json", JSON.stringify(out));
  console.log(`${out.length} players → .load/players.json`);
}

guard();
// Seeding starts over: players left from an earlier run stand where that run left them.
await clean();
if (!process.argv.includes("--clean")) await seed();
await prisma.$disconnect();
