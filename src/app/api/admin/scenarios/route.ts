// Admin → Scenarios: list every scenario (the six starters and the admin's own, with how often each
// was won or failed), save one (validated; a starter's id overrides it), switch one on or off, delete.
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { body, route } from "@/server/http";
import { adminDelete, adminList, adminSave } from "@/server/scenarios";
import { validateScenario } from "@/lib/scenarios/validate";
import { t } from "@/lib/i18n";

export const GET = route(async () => {
  await requireAdmin();
  return { scenarios: await adminList() };
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), scenario: z.unknown() }),
  z.object({ action: z.literal("validate"), scenario: z.unknown() }),
  z.object({ action: z.literal("enable"), scenario: z.unknown(), enabled: z.boolean() }),
  z.object({ action: z.literal("delete"), id: z.string().max(40) }),
]);

/** Problems come back as `issues` (path + message) so the editor can show them next to the field. */
const refuse = (errors: { path: string; message: string; vars?: Record<string, string | number> }[]) =>
  Response.json({ error: t("Fix the highlighted fields"), issues: errors.map((e) => ({ path: e.path, message: t(e.message, e.vars) })) }, { status: 400 });

export const POST = route(async (req) => {
  await requireAdmin();
  const d = await body(req, Action);
  if (d.action === "delete") return (await adminDelete(d.id), { ok: true });
  if (d.action === "validate") {
    const v = validateScenario(d.scenario);
    return v.ok ? { ok: true } : refuse(v.errors);
  }
  const r = await adminSave(d.scenario, d.action === "enable" ? d.enabled : undefined);
  return r.ok ? { ok: true, scenario: r.value } : refuse(r.errors);
});
