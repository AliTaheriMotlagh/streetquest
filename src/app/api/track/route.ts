// First-party, cookie-light analytics for the marketing dashboard.
import { cookies } from "next/headers";
import { z } from "zod";
import { currentUser } from "@/server/auth";
import { body, route } from "@/server/http";
import { track } from "@/server/rewards";

const Schema = z.object({ name: z.enum(["page_view", "cta_click", "share", "client_error"]), path: z.string().max(200).optional() });

export const POST = route(async (req) => {
  const d = await body(req, Schema);
  let utm: { source?: string; campaign?: string } = {};
  try {
    utm = JSON.parse((await cookies()).get("sq_utm")?.value ?? "{}");
  } catch {}
  const u = await currentUser();
  await track(d.name, { userId: u?.id, path: d.path, source: utm.source, campaign: utm.campaign });
  return { ok: true };
});
