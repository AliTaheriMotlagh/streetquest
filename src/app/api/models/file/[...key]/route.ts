// Serves 3D models uploaded from Admin → Objects on Cloudflare (R2 binding, see
// src/server/modelOverrides.ts). The key is immutable: it carries the file's hash.
import { cfEnv, MODEL_PREFIX } from "@/server/cf";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join("/");
  if (!path.startsWith(MODEL_PREFIX)) return new Response(null, { status: 404 });
  const env = await cfEnv();
  const obj = await env?.UPLOADS?.get(path);
  if (!obj) return new Response(null, { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "model/gltf-binary",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(obj.size),
      "x-content-type-options": "nosniff",
    },
  });
}
