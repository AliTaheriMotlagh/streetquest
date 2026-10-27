// Serverless-friendly "realtime": everything lives in Postgres and clients poll
// /api/sync. Works on Vercel (no long-lived sockets) and anywhere else.
import { prisma } from "../lib/db";
import { DEFAULT_LOCALE, isLocale, translate, type Locale } from "../lib/i18n";
import { withLocale } from "./i18n";
import { pushSoon } from "./push";

export type Notice = {
  title: string;
  body?: string;
  kind?: "info" | "reward" | "social" | "delivery" | "event";
  /** What the game does with it beyond showing it (sound, celebration) — never parse the text. */
  tag?: "incoming" | "levelup" | "hurt" | "ready";
  /** The panel tapping it opens (see NoticeLink). Defaults by kind. */
  link?: NoticeLink;
};

/** Panels a notification can open; "me:<tab>" opens a Hero tab. */
export type NoticeLink = "wallet" | "play" | "jobs" | "market" | "social" | "events" | "biz" | "store" | "me" | "me:quests" | "me:hero";
const LINK_BY_KIND: Partial<Record<NonNullable<Notice["kind"]>, NoticeLink>> = { delivery: "jobs", social: "social", event: "events" };

/** A player counts as online if their client pinged within this window. */
export const ONLINE_MS = 90_000;
export const onlineSince = () => new Date(Date.now() - ONLINE_MS);
export const isOnline = (lastSeenAt: Date | null) => !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_MS;

/** The language a player reads the game in. */
export async function localeOf(userId: string): Promise<Locale> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }).catch(() => null);
  return isLocale(u?.locale) ? u.locale : DEFAULT_LOCALE;
}

/** Run `fn` with t() speaking `userId`'s language (for text sent to someone else). */
export async function asUser<T>(userId: string, fn: () => T): Promise<T> {
  return withLocale(await localeOf(userId), fn);
}

/**
 * Tell a player something (inbox + toast, and a push when they're away). Pass a
 * builder that writes the text with t(): it runs in the *recipient's* language, which
 * is often not the language of the request that caused it.
 *
 *   notify(t.id, () => ({ kind: "event", title: t("🔫 {name} shot you!", { name }) }))
 */
export async function notify(userId: string, n: Notice | (() => Notice)) {
  const locale = await localeOf(userId);
  const notice =
    typeof n === "function"
      ? withLocale(locale, n)
      : { ...n, title: translate(locale, n.title), body: n.body && translate(locale, n.body) };
  const link = notice.link ?? (notice.kind ? LINK_BY_KIND[notice.kind] : undefined);
  await prisma.notification.create({ data: { userId, kind: notice.kind ?? "info", tag: notice.tag, title: notice.title, body: notice.body, link } }).catch(() => {});
  // Also reach the phone when the game isn't open (fire-and-forget).
  pushSoon(userId, { title: notice.title, body: notice.body, kind: notice.kind });
}
