// Quest engine: game routes call questEvent(); progress is stored per quest key.
import { prisma } from "../lib/db";
import { dayKey } from "../lib/progression";
import { CAMPAIGN, campaignKey, dailyQuests, STATE_KINDS, type QuestDef, type QuestKind } from "../lib/quests";
import { HttpError } from "./http";
import { notify } from "./hub";

async function activeQuests(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { campaignStep: true, timezone: true } });
  const list: (QuestDef & { key: string; campaign: boolean })[] = dailyQuests(userId, dayKey(u.timezone)).map((q) => ({ ...q, campaign: false }));
  const step = CAMPAIGN[u.campaignStep];
  if (step) list.unshift({ ...step, key: campaignKey(u.campaignStep), campaign: true });
  return list;
}

/** Record progress, e.g. questEvent(id, "train", 5). Never throws — quests must not break gameplay. */
export async function questEvent(userId: string, kind: QuestKind, n = 1) {
  try {
    for (const q of (await activeQuests(userId)).filter((x) => x.kind === kind)) {
      const row = await prisma.questProgress.upsert({ where: { userId_key: { userId, key: q.key } }, create: { userId, key: q.key, progress: n }, update: { progress: { increment: n } } });
      if (row.progress >= q.target && row.progress - n < q.target) await notify(userId, { kind: "reward", title: `📜 Quest complete: ${q.title}`, body: "Claim your reward in Hero → Quests" });
    }
  } catch (e) {
    console.error("quest event failed", e);
  }
}

export async function questView(userId: string, state: { heroClass: boolean; base: boolean; equipped: boolean }) {
  const quests = await activeQuests(userId);
  const rows = await prisma.questProgress.findMany({ where: { userId, key: { in: quests.map((q) => q.key) } } });
  const by = new Map(rows.map((r) => [r.key, r]));
  const stateDone: Partial<Record<QuestKind, boolean>> = { class: state.heroClass, base: state.base, equip: state.equipped };
  return quests.map((q) => {
    const r = by.get(q.key);
    const progress = STATE_KINDS.includes(q.kind) && stateDone[q.kind] ? q.target : Math.min(q.target, r?.progress ?? 0);
    return { ...q, progress, done: progress >= q.target, claimed: !!r?.claimed };
  });
}

export async function claimQuest(userId: string, key: string, state: Parameters<typeof questView>[1]) {
  const q = (await questView(userId, state)).find((x) => x.key === key);
  if (!q) throw new HttpError(404, "Quest not found");
  if (!q.done) throw new HttpError(400, "Quest not finished yet");
  if (q.claimed) throw new HttpError(409, "Already claimed");
  // Atomic claim: only one concurrent request can flip claimed → true.
  const existing = await prisma.questProgress.findUnique({ where: { userId_key: { userId, key } } });
  if (!existing) {
    await prisma.questProgress.create({ data: { userId, key, progress: q.target, claimed: true } }).catch(() => {
      throw new HttpError(409, "Already claimed");
    });
  } else if (!(await prisma.questProgress.updateMany({ where: { userId, key, claimed: false }, data: { claimed: true } })).count) {
    throw new HttpError(409, "Already claimed");
  }
  if (q.campaign) await prisma.user.updateMany({ where: { id: userId, campaignStep: Number(key.slice(2)) }, data: { campaignStep: { increment: 1 } } });
  return q;
}
