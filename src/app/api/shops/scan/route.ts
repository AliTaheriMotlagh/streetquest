// The owner's 3D scan of their store (lib/glbCheck.ts): POST the .glb itself as the body (?shop=<id>&turn=0–3) —
// already optimised in the owner's browser (components/game/scan.ts) — PATCH { shop, turn } to turn it, DELETE
// ?shop=<id> to take it down. Players walking into the shop see it instead of the generated room.
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkGlb, quarterTurns, SCAN_LIMITS } from "@/lib/glbCheck";
import { t } from "@/lib/i18n";
import { requireUser } from "@/server/auth";
import { body, HttpError, route } from "@/server/http";

async function myShop(shopId: string | null) {
  const u = await requireUser();
  const s = shopId ? await prisma.shop.findUnique({ where: { id: shopId }, select: { id: true, ownerId: true } }) : null;
  if (!s) throw new HttpError(404, t("This shop doesn't exist any more"));
  if (s.ownerId !== u.id) throw new HttpError(403, t("Only the shop's owner can do that"));
  return s;
}

export const POST = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const s = await myShop(sp.get("shop"));
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > SCAN_LIMITS.bytes) throw new HttpError(413, t("The scan is too big (12 MB at most) — export it smaller"));
  const data = new Uint8Array(await req.arrayBuffer());
  const c = checkGlb(data);
  if (!c.ok) throw new HttpError(400, c.problem);
  const version = createHash("sha1").update(data).digest("hex").slice(0, 12);
  const turn = quarterTurns(sp.get("turn"));
  const row = { data, version, turn, bytes: data.byteLength, triangles: c.info.triangles };
  await prisma.shopScan.upsert({ where: { shopId: s.id }, create: { shopId: s.id, ...row }, update: { ...row, createdAt: new Date() } });
  return { scan: { version, turn, bytes: data.byteLength, triangles: c.info.triangles }, message: t("Your store's 3D scan is up — players walking in will see it") };
});

const Turn = z.object({ shop: z.string(), turn: z.number().int() });
export const PATCH = route(async (req) => {
  const d = await body(req, Turn);
  const s = await myShop(d.shop);
  const r = await prisma.shopScan.update({ where: { shopId: s.id }, data: { turn: quarterTurns(d.turn) }, select: { version: true, turn: true, bytes: true, triangles: true } });
  return { scan: r };
});

export const DELETE = route(async (req) => {
  const s = await myShop(new URL(req.url).searchParams.get("shop"));
  await prisma.shopScan.deleteMany({ where: { shopId: s.id } });
  return { scan: null, message: t("The 3D scan is taken down") };
});
