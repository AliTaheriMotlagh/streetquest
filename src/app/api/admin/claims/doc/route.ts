// Admin: the licence / bill photo an owner sent with a claim (GET ?id=). Never cached, never public.
import { requireAdmin } from "@/server/auth";
import { claimDoc } from "@/server/claims";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const doc = await claimDoc(new URL(req.url).searchParams.get("id") ?? "");
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(doc.bytes), { headers: { "content-type": doc.type, "cache-control": "private, no-store" } });
}
