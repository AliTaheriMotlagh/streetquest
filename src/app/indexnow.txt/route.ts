import { indexNowKey } from "@/lib/seo";

// The IndexNow key file (lib/seo.ts): search engines fetch it to check a ping really came from this site.
export const dynamic = "force-dynamic";

export function GET() {
  const key = indexNowKey(process.env.INDEXNOW_KEY);
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
