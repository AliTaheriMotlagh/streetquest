// Multiplayer mini-games and squad runs. Clients poll GET ~1×/s while in a lobby.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/server/auth";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { leave, loadLobby, openOrJoin, start, submitScore, tick } from "@/server/lobby";

async function view(id: string, userId: string) {
  let l = await loadLobby(id);
  if (!l) throw new HttpError(404, "Lobby closed");
  l = await tick(l);
  const member = l.players.some((p) => p.userId === userId);
  // Squad runs: members see each other's exact positions.
  const where = member && (l.kind === "race" || l.kind === "coop") && l.status !== "OPEN"
    ? new Map((await prisma.user.findMany({ where: { id: { in: l.players.map((p) => p.userId) } }, select: { id: true, lastLat: true, lastLng: true } })).map((u) => [u.id, u]))
    : null;
  const runs = where ? new Map((await prisma.missionRun.findMany({ where: { lobbyId: l.id } })).map((r) => [r.userId, r.status])) : null;
  return {
    now: Date.now(),
    lobby: {
      id: l.id,
      kind: l.kind,
      spawnId: l.spawnId,
      seed: l.seed,
      status: l.status,
      hostId: l.hostId,
      openUntil: l.openUntil.getTime(),
      startsAt: l.startsAt?.getTime() ?? null,
      endsAt: l.endsAt?.getTime() ?? null,
      players: l.players.map((p) => ({
        userId: p.userId,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        place: p.place,
        reward: p.userId === userId ? p.reward : p.reward ? "✓" : null,
        finished: !!p.finishedAt,
        run: runs?.get(p.userId) ?? null,
        lat: where?.get(p.userId)?.lastLat ?? null,
        lng: where?.get(p.userId)?.lastLng ?? null,
      })),
    },
  };
}

export const GET = route(async (req) => {
  const u = await requireUser();
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  if (id) return view(id, u.id);
  const spawnId = sp.get("spawnId");
  if (!spawnId) throw new HttpError(400, "id or spawnId required");
  const open = await prisma.lobby.findFirst({ where: { spawnId, status: "OPEN", openUntil: { gt: new Date() } }, include: { players: { select: { name: true, avatar: true } } } });
  return { open: open ? { id: open.id, kind: open.kind, players: open.players, openUntil: open.openUntil.getTime() } : null };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), spawnId: z.string().max(80), mode: z.enum(["race", "coop"]).optional() }),
  z.object({ action: z.literal("start"), lobbyId: z.string().max(40) }),
  z.object({ action: z.literal("leave"), lobbyId: z.string().max(40) }),
  z.object({ action: z.literal("score"), lobbyId: z.string().max(40), score: z.number().finite() }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "open") {
    const id = await openOrJoin(u, d.spawnId, d.mode);
    return view(id, u.id);
  }
  const l = await loadLobby(d.lobbyId);
  if (!l) throw new HttpError(404, "Lobby closed");
  if (!l.players.some((p) => p.userId === u.id)) throw new HttpError(403, "You're not in this lobby");
  if (d.action === "leave") {
    await leave(u, l.id);
    return { ok: true };
  }
  if (d.action === "start") {
    if (l.hostId !== u.id) throw new HttpError(403, "Only the host can start early");
    if (l.status === "OPEN") await start(l);
    return view(l.id, u.id);
  }
  await submitScore(u, l, d.score);
  return view(l.id, u.id);
});
