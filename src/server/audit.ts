// The audit log: who did what to a business, a claim or a player, kept for admins (Admin → Audit log)
// and for a store's owner (their store's history). Writing never fails the action it records.
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/clientIp";

export type AuditTarget = "business" | "claim" | "user" | "campaign";

async function ipNow(): Promise<string> {
  try {
    const h = await headers();
    const ip = clientIp(h);
    return ip === "local" ? "" : ip;
  } catch {
    return "";
  }
}

export async function audit(actor: { id: string; username: string } | null, action: string, target: { type: AuditTarget; id: string }, summary = "", data: Record<string, unknown> = {}) {
  try {
    await prisma.auditLog.create({
      data: { actorId: actor?.id ?? null, actor: actor?.username ?? "", action, targetType: target.type, targetId: target.id, summary: summary.slice(0, 300), data: data as Prisma.InputJsonValue, ip: await ipNow() },
    });
  } catch {
    // The log is a record, not a gate.
  }
}

export type AuditRow = { id: string; actor: string; actorId: string | null; action: string; targetType: string; targetId: string; summary: string; data: unknown; ip: string; createdAt: string };
const row = (r: { id: string; actor: string; actorId: string | null; action: string; targetType: string; targetId: string; summary: string; data: unknown; ip: string; createdAt: Date }, withIp: boolean): AuditRow => ({
  ...r,
  ip: withIp ? r.ip : "",
  createdAt: r.createdAt.toISOString(),
});

/** Admin: the log, newest first, narrowed by action group, actor (username), target and words. */
export async function auditList(f: { group?: string; actor?: string; target?: string; q?: string; before?: string; take?: number }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(f.group ? { action: { startsWith: `${f.group}.` } } : {}),
    ...(f.actor ? { actor: { contains: f.actor, mode: "insensitive" } } : {}),
    ...(f.target ? { targetId: f.target } : {}),
    ...(f.q ? { summary: { contains: f.q, mode: "insensitive" } } : {}),
    ...(f.before ? { createdAt: { lt: new Date(f.before) } } : {}),
  };
  const take = Math.min(200, f.take ?? 100);
  const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take });
  return { rows: rows.map((r) => row(r, true)), more: rows.length === take };
}

/** An owner's view of their store: what happened to it and its claims (no IPs). */
export async function businessHistory(businessId: string, take = 50) {
  const claims = await prisma.bizClaim.findMany({ where: { businessId }, select: { id: true } });
  const rows = await prisma.auditLog.findMany({
    where: { OR: [{ targetType: "business", targetId: businessId }, { targetType: "claim", targetId: { in: claims.map((c) => c.id) } }] },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((r) => row(r, false));
}
