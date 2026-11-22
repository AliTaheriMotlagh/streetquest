// Cloudflare-only bindings, typed just enough that the app doesn't need Workers types
// everywhere. On a normal Node server (or `next dev` without the adapter) cfEnv() is null
// and the callers keep using their old disk / Vercel Blob path.

export type R2ObjectBody = {
  body: ReadableStream;
  size: number;
  httpMetadata?: { contentType?: string };
};

export type R2BucketLike = {
  put(key: string, value: Uint8Array, opts?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
};

export type CloudflareEnvLike = { UPLOADS?: R2BucketLike };

/** The Cloudflare bindings, or null outside the Workers runtime. */
export async function cfEnv(): Promise<CloudflareEnvLike | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env as CloudflareEnvLike;
  } catch {
    return null;
  }
}

/** Every model upload lives under this R2 prefix (the bucket is shared with other apps). */
export const MODEL_PREFIX = "streetquest/models/";
