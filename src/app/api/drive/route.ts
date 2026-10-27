// The 3D city's live channel: POST where my vehicle is (a few times a second while
// driving), get back everyone else worth drawing and my party's round. Viewers following
// real GPS send only `here`. DELETE when leaving the city. See server/drive.ts.
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { park, report } from "@/server/drive";

const LatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const Schema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  alt: z.number().min(0).max(2000).default(0),
  yaw: z.number().min(-1e4).max(1e4).default(0),
  speed: z.number().min(0).max(300).default(0),
  vehicle: z.string().max(12).default("car"),
  color: z.string().max(9).optional(),
  sim: z.boolean().optional(),
  here: LatLng.optional(),
});

export const POST = route(async (req) => {
  const u = await requireUser();
  const d = await body(req, Schema);
  return report(u, d);
});

export const DELETE = route(async () => {
  const u = await requireUser();
  await park(u.id);
  return { ok: true };
});
