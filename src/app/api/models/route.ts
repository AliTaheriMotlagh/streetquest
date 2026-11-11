// The replacement models an admin has published (Admin → Objects), by slot. Public and
// cacheable: the client loaders consult it once per session and fall back to the built-in
// file for any slot not listed (or when this fails). See components/drive/modelOverride.ts.
import { modelManifest } from "@/server/modelOverrides";

export async function GET() {
  const headers = { "cache-control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120" };
  try {
    return Response.json(await modelManifest(), { headers });
  } catch {
    // Table missing (first deploy) or the database hiccuped: nothing is overridden.
    return Response.json({ models: {} }, { headers: { "cache-control": "public, max-age=5" } });
  }
}
