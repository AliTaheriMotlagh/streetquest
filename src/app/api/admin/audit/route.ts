// Admin → Audit log: who did what (server/audit.ts), newest first. ?group=business|claim|campaign|coupon|admin
// &actor=<username>&target=<id>&q=<words>&before=<ISO time, for the next page>.
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";
import { auditList } from "@/server/audit";
import { AUDIT_GROUPS } from "@/lib/claims";

export const GET = route(async (req) => {
  await requireAdmin();
  const p = new URL(req.url).searchParams;
  const group = p.get("group") ?? "";
  const s = (k: string, n = 80) => (p.get(k) ?? "").trim().slice(0, n) || undefined;
  return auditList({ group: (AUDIT_GROUPS as readonly string[]).includes(group) ? group : undefined, actor: s("actor"), target: s("target", 40), q: s("q"), before: s("before", 40) });
});
