// Errors in players' browsers (pure; tests/clientLog.test.ts) — what the server's own logs never see:
// a crash, a script that failed to load after a deploy, a blocked connection (the realtime server, a
// map tile host, a travel site the phone asks directly), a promise nobody caught. components/
// ClientLog.tsx catches them, POST /api/log keeps them (a Metric "client_error" row: what, which
// country, which browser — never who) and prints them to the server log; Admin → Browser errors groups them.
export type ClientKind = "crash" | "error" | "promise" | "chunk" | "net" | "ws" | "tiles";
export const CLIENT_KINDS: ClientKind[] = ["crash", "error", "promise", "chunk", "net", "ws", "tiles"];
export type ClientReport = { kind: ClientKind; msg: string; host?: string; page?: string };

/** At most this many reports from one page load (a loop of errors must not flood the server). */
export const MAX_PER_PAGE = 8;

/** A message with what makes every copy different taken out: long numbers, ids, query strings, whole URLs (their host is kept). */
export function cleanMsg(s: string): string {
  return s
    .replace(/https?:\/\/([^/\s?#]+)[^\s)'"]*/g, "$1")
    .replace(/\b[0-9a-f]{12,}\b/gi, "…")
    .replace(/\b\d{4,}\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

/** The browser in a few characters: "Android Chrome 130", "iOS Safari 17", "Instagram (iOS)". */
export function uaSummary(ua: string): string {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Other";
  const inApp = /Instagram/i.test(ua) ? "Instagram" : /FBAN|FBAV/i.test(ua) ? "Facebook" : /Telegram/i.test(ua) ? "Telegram" : /TikTok|musical_ly/i.test(ua) ? "TikTok" : null;
  if (inApp) return `${inApp} (${os})`;
  const v = (re: RegExp) => ua.match(re)?.[1];
  const b = v(/SamsungBrowser\/(\d+)/) ? `Samsung ${v(/SamsungBrowser\/(\d+)/)}` : v(/Edg\/(\d+)/) ? `Edge ${v(/Edg\/(\d+)/)}` : v(/Firefox\/(\d+)/) ? `Firefox ${v(/Firefox\/(\d+)/)}` : v(/(?:Chrome|CriOS)\/(\d+)/) ? `Chrome ${v(/(?:Chrome|CriOS)\/(\d+)/)}` : v(/Version\/(\d+)[\d.]* .*Safari/) ? `Safari ${v(/Version\/(\d+)[\d.]* .*Safari/)}` : "Browser";
  return `${os} ${b}`;
}

/** What one report is stored as (Metric.path; Metric.source = country, Metric.campaign = browser). */
export const rowOf = (r: ClientReport) => `${r.kind}|${cleanMsg(r.msg)}${r.host ? ` @${r.host}` : ""}${r.page ? ` ‹${r.page}›` : ""}`.slice(0, 200);
/** Back from a stored row. */
export function parseRow(path: string): { kind: ClientKind; msg: string } {
  const i = path.indexOf("|");
  const kind = path.slice(0, i) as ClientKind;
  return CLIENT_KINDS.includes(kind) ? { kind, msg: path.slice(i + 1) } : { kind: "error", msg: path };
}

export type ErrorGroup = { kind: ClientKind; msg: string; n: number; countries: Record<string, number>; browsers: Record<string, number>; last: string };
/** The same error from everyone, once: how often, from which countries and browsers, when last — the most frequent first. */
export function groupErrors(rows: { path: string | null; source: string | null; campaign: string | null; createdAt: Date | string }[]): ErrorGroup[] {
  const by = new Map<string, ErrorGroup>();
  for (const r of rows) {
    if (!r.path) continue;
    const { kind, msg } = parseRow(r.path);
    const g = by.get(r.path) ?? { kind, msg, n: 0, countries: {}, browsers: {}, last: "" };
    g.n++;
    const c = r.source || "??", b = r.campaign || "?";
    g.countries[c] = (g.countries[c] ?? 0) + 1;
    g.browsers[b] = (g.browsers[b] ?? 0) + 1;
    const at = typeof r.createdAt === "string" ? r.createdAt : r.createdAt.toISOString();
    if (at > g.last) g.last = at;
    by.set(r.path, g);
  }
  return [...by.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
}
