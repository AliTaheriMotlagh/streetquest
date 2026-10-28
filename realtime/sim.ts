// Headless match simulator (npm run rt:sim [-- bomb|tdm|ffa]): plays a whole match of
// bots on a synthetic street grid in simulated time (a few seconds of CPU), through the
// real Match and bot code, and prints how it went — rounds, plants, defuses, kills and
// where the bomb carrier was. For tuning bots and catching rules that never fire.
//   DBG=1          also log the defence while a bomb is planted
//   DEFUSE_TEST=1  every attacker drops the moment the bomb is planted (does defusing work?)
import { localFrame } from "../src/lib/arena/protocol";
import { bombSide, type ModeKey } from "../src/lib/arena/modes";
import { Match, type MatchResult } from "./match";
import { Player } from "./player";

const mode = (process.argv[2] ?? "bomb") as ModeKey;
const ORIGIN = { lat: 35.7, lng: 51.4 };
const roads: number[][] = [];
for (let k = -300; k <= 300; k += 40) (roads.push([-300, k, 300, k]), roads.push([k, -300, k, 300]));
const buildings: { p: number[]; h: number; mh: number }[] = [];
for (let x = -300; x < 300; x += 40) for (let z = -300; z < 300; z += 40) buildings.push({ p: [x + 8, z + 8, x + 32, z + 8, x + 32, z + 32, x + 8, z + 32], h: 12, mh: 0 });

let sid = 1;
let now = Date.now();
let ended: MatchResult[] | null = null;
let gone = false;
const host = new Player({ sid: sid++, userId: "host", name: "Host", avatar: "🙂", level: 5, ws: null, anchor: ORIGIN });
host.moveTo(ORIGIN, 0, now);
const m = new Match("sim", host, mode, 150, 9, "normal", { roads, buildings }, { newSid: () => sid++, ended: (_m, r) => (ended = r), disband: () => (gone = true) });
console.log(`${mode}: nav nodes ${m.nav.nodes.length}, sites ${m.sites.map((s) => `${s.name}(${Math.round(s.x)},${Math.round(s.z)})`).join(" ")}`);
m.join(host, now);
// The host stands at spawn, out of the way: on defence first in bomb.
if (mode === "bomb") m.setTeam(host, 2);
m.start(host, now);

const F = localFrame(ORIGIN);
const log: string[] = [];
let lastBomb = "", lastPhase = "", lastRound = 0;
const STEP = 50;
for (let t = 0; t < 20 * 60_000 && !gone; t += STEP) {
  now += STEP;
  // The host keeps "reporting" where they stand.
  if (!host.dead) host.moveTo(host.ll, 0, now);
  m.tick(STEP / 1000, now);
  const b = m.bomb;
  const sec = Math.round(t / 1000);
  if (m.round !== lastRound) (lastRound = m.round), log.push(`${sec}s round ${m.round} starts (score ${m.teamScore.slice(1).join(":")})`);
  if (b && b.state !== lastBomb) {
    lastBomb = b.state;
    log.push(`${sec}s bomb ${b.state}${b.site ? ` at ${b.site}` : ""}`);
  }
  if (m.phase !== lastPhase) {
    lastPhase = m.phase;
    if (m.phase === "roundEnd" || m.phase === "ended") log.push(`${sec}s ${m.phase}: winner team ${m.winner?.team} (${m.winner?.reason})`);
  }
  // DEFUSE_TEST: the moment a bomb is planted, every attacker drops — can the defence defuse in time?
  if (process.env.DEFUSE_TEST && b?.state === "planted") for (const p of m.players) if (!p.dead && p.bot && bombSide(p.team, m.round) === "attack") (p.hp = 0, p.dead = true);
  if (process.env.DBG && b?.state === "planted" && t % 5000 === 0) {
    const bq = F.toXZ(b.lat, b.lng);
    const brains = (m as unknown as { brains: Map<Player, { target: Player | null; x: number; z: number; path: number[] }> }).brains;
    log.push(`${sec}s defenders: ` + [...m.players].filter((p) => p.team && p.bot && !p.dead && ((p.team === 2) !== (m.round > 3))).map((p) => {
      const br = brains.get(p)!;
      return `${p.name.split(" ")[0]} d=${Math.round(Math.hypot(br.x - bq.x, br.z - bq.z))} act=${p.actingUntil ? "Y" : "n"} tgt=${br.target ? br.target.name.split(" ")[0] : "-"} path=${br.path.length}`;
    }).join(" | "));
  }
  // Where's the carrier, every 15 s of a live round?
  if (mode === "bomb" && m.phase === "live" && t % 15_000 === 0) {
    const c = [...m.players].find((p) => p.carrying);
    if (c) {
      const q = F.toXZ(c.lat, c.lng);
      const d = Math.min(...m.sites.map((s) => Math.hypot(s.x - q.x, s.z - q.z)));
      log.push(`${sec}s carrier ${c.name} ${Math.round(d)} m from the nearest site`);
    }
  }
}
for (const l of log) console.log(l);
console.log("final", m.phase, "score", m.teamScore.slice(1).join(":"), "kills", [...m.players].map((p) => `${p.name.split(" ")[0]}:${p.kills}/${p.deaths}`).join(" "));
console.log(ended ? `results posted for ${(ended as MatchResult[]).length} human(s)` : "no results");
