import { allLangPaths, indexNowBody, indexNowKey } from "@/lib/seo";
import { SITE } from "@/lib/site";

/**
 * Tells Bing/Yandex/Seznam/Naver about new or changed public pages (every language version), fire-and-forget: a
 * failure is logged and never reaches the player. Off unless INDEXNOW_KEY is set and the site has a real https URL.
 */
export function pingIndexNow(paths: string[]): void {
  const key = indexNowKey(process.env.INDEXNOW_KEY);
  if (!key || !SITE.url.startsWith("https://") || !paths.length) return;
  const body = indexNowBody(SITE.url, key, paths.flatMap(allLangPaths));
  void fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
    .then((r) => {
      if (!r.ok && r.status !== 202) console.warn(`indexnow: ${r.status} for ${body.urlList.length} urls`);
    })
    .catch((e: Error) => console.warn(`indexnow: ${e.message}`));
}
