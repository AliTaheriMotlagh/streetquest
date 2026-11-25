// Server half of i18n. Every API request runs inside withLocale() (see http.ts), so
// t() anywhere below a route handler — error messages, "+50 coins" replies, level
// titles — speaks the caller's language. Notifications use the *recipient's* language
// instead (hub.ts). Server components ask for theirs with getT().
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { countryOf } from "../lib/clientIp";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  registerMessages,
  resolveLocale,
  setLocaleResolver,
  translate,
  type Locale,
  type Vars,
} from "../lib/i18n";
import fa from "../lib/i18n/fa";
import tr from "../lib/i18n/tr";

registerMessages("fa", fa);
registerMessages("tr", tr);

const als = new AsyncLocalStorage<Locale>();
// Cloudflare Workers implement AsyncLocalStorage.run() but not enterWith() (used by
// getT() below to keep the locale for the rest of a server component). React's cache()
// gives us a per-request slot instead, so t() still speaks the page's language there.
const pageSlot = cache(() => ({ value: DEFAULT_LOCALE as Locale }));
const currentLocale = () => {
  const fromAls = als.getStore();
  if (fromAls) return fromAls;
  try {
    return pageSlot().value;
  } catch {
    return DEFAULT_LOCALE; // not inside a React render
  }
};
setLocaleResolver(currentLocale);

/** Run `fn` with t() speaking `locale`. */
export const withLocale = <T>(locale: Locale, fn: () => T): T => als.run(locale, fn);

const cookieValue = (header: string | null, name: string) =>
  header
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

/** The language an API request asked for: the player's choice, else their browser's. */
export function localeOfRequest(req: Request): Locale {
  return resolveLocale(cookieValue(req.headers.get("cookie"), LOCALE_COOKIE), req.headers.get("accept-language"), countryOf(req.headers));
}

/** The current page request's language (server components, metadata). */
export async function pageLocale(): Promise<Locale> {
  const h = await headers();
  const forced = h.get(LOCALE_HEADER); // ?lang= in the URL (middleware)
  if (isLocale(forced)) return forced;
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value, h.get("accept-language"), countryOf(h));
}

/**
 * A translator for a server component. Also makes plain t() (used by shared helpers
 * like formatDistance) speak this language for the rest of the component's code.
 */
export async function getT() {
  const locale = await pageLocale();
  try {
    als.enterWith(locale);
  } catch {
    // Workers: AsyncLocalStorage.enterWith() is not implemented — use the per-request slot.
    pageSlot().value = locale;
  }
  return { locale, t: (message: string, vars?: Vars) => translate(locale, message, vars) };
}
