// The daily cleanup on the one-server setup (docker/compose.yml) — what Cloudflare's Cron Trigger and the old
// vercel.json cron do: GET /api/cron/cleanup with CRON_SECRET at 04:00 UTC. Plain Node, no packages.

/** The next time (ms) at `hour`:00 UTC strictly after `now`. Pure. */
export function nextRun(now, hour = 4) {
  const d = new Date(now);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour);
  return t > now ? t : t + 86_400_000;
}

async function cleanup(app, secret) {
  try {
    const res = await fetch(`${app}/api/cron/cleanup`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(120_000) });
    console.log(`[cron] cleanup ${res.status}`);
  } catch (e) {
    console.error(`[cron] cleanup failed: ${e.message}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const app = (process.env.APP_URL || "http://app:3000").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set — no daily cleanup");
    setInterval(() => {}, 1 << 30); // stay up so compose doesn't restart it in a loop
  } else {
    const loop = () => {
      const wait = nextRun(Date.now()) - Date.now();
      console.log(`[cron] next cleanup in ${Math.round(wait / 60000)} min`);
      setTimeout(() => cleanup(app, secret).finally(loop), wait);
    };
    loop();
  }
}
