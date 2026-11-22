import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// Cloudflare Workers deployment (see wrangler.jsonc). The incremental cache keeps any
// ISR/prerendered page in R2 instead of the Worker's memory, which Workers don't have.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
