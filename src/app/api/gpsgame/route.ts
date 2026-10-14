// GPS mini-games and story missions: start, check progress (from the server's
// trusted position), reroute an unreachable waypoint, quit.
import { z } from "zod";
import { prisma } from "@/lib/db";
import { S } from "@/lib/settings";
import { STORY } from "@/lib/story";
import { requireUser } from "@/server/auth";
import { body, HttpError, route, actionRoute } from "@/server/http";
import { activeGame, checkGame, gameView, rerouteGame, startGame, storyChapterOf, GPS_GAMES } from "@/server/gpsgames";
import { t } from "@/lib/i18n";

async function here(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { lastLat: true, lastLng: true } });
  return u?.lastLat != null && u.lastLng != null ? { lat: u.lastLat, lng: u.lastLng } : null;
}

export const GET = route(async () => {
  const u = await requireUser();
  const { game, lost } = await activeGame(u.id);
  const ch = storyChapterOf(u.storyChapter);
  return {
    active: game ? gameView(game, await here(u.id), u.walkedM) : null,
    lost: lost ? { kind: lost.kind } : null,
    games: GPS_GAMES.map((g) => ({
      ...g,
      name: t(g.name),
      blurb: t(g.blurb),
      reward: g.kind === "hunt" ? { xp: S.huntXp, coins: S.huntCoins } : g.kind === "sprint" ? { xp: S.sprintXp, coins: S.sprintCoins } : { xp: S.rallyXp, coins: S.rallyCoins },
      gems: S.gpsGameGems,
      minutes: g.kind === "hunt" ? S.huntMinutes : g.kind === "sprint" ? S.sprintMinutes : S.rallyMinutes,
      detail: g.kind === "sprint" ? t("{n} m", { n: S.sprintMeters }) : g.kind === "rally" ? t("{n, plural, one {# checkpoint} other {# checkpoints}}", { n: S.rallyCheckpoints }) : t("{min}–{max} m away", { min: S.huntMinM, max: S.huntMaxM }),
    })),
    story: {
      enabled: S.storyEnabled,
      chapter: ch.index,
      replay: ch.replay,
      total: STORY.length,
      completed: Math.min(u.storyChapter, STORY.length),
      chapters: STORY.map((c, i) => ({ title: t(c.title), emoji: c.emoji, intro: t(c.intro), steps: c.steps.length, minutes: c.minutes, reward: c.reward, done: i < u.storyChapter })),
    },
    walkedM: Math.round(u.walkedM),
  };
});

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), kind: z.enum(["hunt", "sprint", "rally", "story"]) }),
  z.object({ action: z.literal("check") }),
  z.object({ action: z.literal("reroute") }),
  z.object({ action: z.literal("quit") }),
]);

export const POST = actionRoute(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  if (d.action === "start") {
    const g = await startGame(u, d.kind);
    const intro = g.kind === "story" ? storyChapterOf(u.storyChapter).def.intro : GPS_GAMES.find((x) => x.kind === g.kind)?.blurb;
    return { message: g.kind === "story" ? t("📖 Chapter started") : t("🎮 Game on!"), intro: intro && t(intro) };
  }
  const { game } = await activeGame(u.id);
  if (!game) throw new HttpError(400, t("No GPS game running"));
  if (d.action === "quit") {
    await prisma.gpsGame.update({ where: { id: game.id }, data: { status: "QUIT", data: { ...(game.data as object), finishedAt: Date.now() } } });
    return { message: t("Game abandoned") };
  }
  if (d.action === "reroute") {
    await rerouteGame(u, game);
    return { message: t("🧭 New route plotted") };
  }
  const r = await checkGame(u, game);
  return r;
});
