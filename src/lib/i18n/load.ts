// Loads a language's messages on demand, so English players never download the
// Persian catalog (and vice versa when more languages arrive). The server's API and
// page code registers every catalog up front instead (server/i18n.ts).
import { DEFAULT_LOCALE, registerMessages, type Locale, type Messages } from "./index";

const LOADERS: Record<Exclude<Locale, "en">, () => Promise<{ default: Messages }>> = {
  fa: () => import("./fa"),
};

/** Languages whose load has finished — registered, or given up on for this page. */
const settled = new Set<Locale>([DEFAULT_LOCALE]);
const pending = new Map<Locale, Promise<void>>();

export const catalogSettled = (locale: Locale) => settled.has(locale);

/** Resolves once `locale`'s messages are registered. One request per language per page. */
export function loadCatalog(locale: Locale): Promise<void> {
  if (settled.has(locale)) return Promise.resolve();
  let p = pending.get(locale);
  if (!p) {
    p = LOADERS[locale as Exclude<Locale, "en">]()
      .then((m) => registerMessages(locale, m.default))
      // A failed chunk (flaky network) must not leave the app stuck: this page shows
      // English text, and the next load tries again.
      .catch((e) => console.error("couldn't load translations", e))
      .finally(() => settled.add(locale));
    pending.set(locale, p);
  }
  return p;
}
