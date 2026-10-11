// Translations. The English text is the message key (gettext / Lingui style): code reads
// naturally, and a string nobody has translated yet simply shows in English instead of
// a raw key. Pure and isomorphic — the server resolves the locale per request (see
// server/i18n.ts), the browser from <I18nProvider>.
//
//   t("Not enough coins")
//   t("Go to {name} to buy tickets", { name })
//   t("{n, plural, one {# ticket} other {# tickets}} bought", { n })
//
// Numbers passed as variables are formatted for the locale (Persian digits in fa).
// Data tables (item names, unit names…) keep their English text and are wrapped with
// msg() so the checker finds them; they are translated where they're shown: t(item.name).

export const LOCALES = ["en", "fa"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** The player's language choice (1 year). Read by pages, API routes and the middleware. */
export const LOCALE_COOKIE = "sq_lang";

export const LOCALE_META: Record<Locale, { name: string; dir: "ltr" | "rtl"; intl: string; og: string }> = {
  en: { name: "English", dir: "ltr", intl: "en-US", og: "en_US" },
  fa: { name: "فارسی", dir: "rtl", intl: "fa-IR", og: "fa_IR" },
};

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
export const dirOf = (l: Locale) => LOCALE_META[l].dir;

/** Best match from an Accept-Language header ("fa-IR,fa;q=0.9,en;q=0.8"). */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? 1);
      return { lang: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const w of wanted) if (isLocale(w.lang)) return w.lang;
  return DEFAULT_LOCALE;
}

/** Cookie value wins; otherwise the browser's preferred languages. */
export const resolveLocale = (cookie: string | null | undefined, acceptLanguage?: string | null): Locale =>
  isLocale(cookie) ? cookie : pickLocale(acceptLanguage);

// ---------------------------------------------------------------- catalogs & current locale
export type Messages = Record<string, string>;
const catalogs: Partial<Record<Locale, Messages>> = {};

export function registerMessages(locale: Locale, messages: Messages) {
  if (catalogs[locale] === messages) return;
  catalogs[locale] = messages;
  compiled.clear();
}

let resolver: () => Locale = () => DEFAULT_LOCALE;
/** The server (AsyncLocalStorage) and the browser (provider) each plug in how to find the locale. */
export function setLocaleResolver(fn: () => Locale) {
  resolver = fn;
}
export const getLocale = (): Locale => resolver();

// ---------------------------------------------------------------- formatting
export type Vars = Record<string, string | number | boolean | null | undefined>;

const numFmt = new Map<string, Intl.NumberFormat>();
/** A number in the locale's digits and grouping (۱۲٬۳۴۵ in Persian). */
export function fmtNum(n: number, locale: Locale = getLocale(), opts?: Intl.NumberFormatOptions) {
  const key = `${locale}|${opts ? JSON.stringify(opts) : ""}`;
  let f = numFmt.get(key);
  if (!f) numFmt.set(key, (f = new Intl.NumberFormat(LOCALE_META[locale].intl, { maximumFractionDigits: 2, ...opts })));
  return f.format(n);
}

/** Persian/Arabic-Indic digits typed on a phone keyboard → ASCII, for codes and amounts. */
export const toAsciiDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

const pluralRules = new Map<Locale, Intl.PluralRules>();
const pluralOf = (locale: Locale, n: number) => {
  let r = pluralRules.get(locale);
  if (!r) pluralRules.set(locale, (r = new Intl.PluralRules(LOCALE_META[locale].intl)));
  return r.select(n);
};

// A tiny ICU MessageFormat subset: {var}, {n, plural, =0 {…} one {…} other {…}} with #,
// and {v, select, a {…} other {…}}. Parsed once per message and cached.
type Part = string | { v: string } | { v: string; kind: "plural" | "select"; opts: Record<string, Part[]> };

function parse(src: string): Part[] {
  let i = 0;
  const parts: Part[] = [];
  const readUntilClose = (): Part[] => {
    // Parse a nested sub-message up to its matching "}".
    const out: Part[] = [];
    let buf = "";
    while (i < src.length) {
      const c = src[i];
      if (c === "}") {
        i++;
        break;
      }
      if (c === "{") {
        if (buf) out.push(buf), (buf = "");
        out.push(readArg());
        continue;
      }
      buf += c;
      i++;
    }
    if (buf) out.push(buf);
    return out;
  };
  const readArg = (): Part => {
    // At "{": either {name} or {name, plural|select, …}.
    const start = i;
    i++;
    const close = src.indexOf("}", i);
    const comma = src.indexOf(",", i);
    if (close === -1) {
      i = src.length;
      return src.slice(start);
    }
    if (comma === -1 || close < comma) {
      i = close + 1;
      return { v: src.slice(start + 1, close).trim() };
    }
    const v = src.slice(i, comma).trim();
    i = comma + 1;
    const comma2 = src.indexOf(",", i);
    const kind = src.slice(i, comma2).trim();
    if (kind !== "plural" && kind !== "select") {
      // Not something we understand: keep the text as written.
      const end = src.indexOf("}", i);
      i = end === -1 ? src.length : end + 1;
      return src.slice(start, i);
    }
    i = comma2 + 1;
    const opts: Record<string, Part[]> = {};
    while (i < src.length) {
      while (src[i] === " " || src[i] === "\n") i++;
      if (src[i] === "}") {
        i++;
        break;
      }
      const brace = src.indexOf("{", i);
      if (brace === -1) {
        i = src.length;
        break;
      }
      const key = src.slice(i, brace).trim();
      i = brace + 1;
      opts[key] = readUntilClose();
    }
    return { v, kind, opts };
  };
  let buf = "";
  while (i < src.length) {
    if (src[i] === "{") {
      if (buf) parts.push(buf), (buf = "");
      parts.push(readArg());
    } else buf += src[i++];
  }
  if (buf) parts.push(buf);
  return parts;
}

function render(parts: Part[], vars: Vars, locale: Locale, hash?: string): string {
  let out = "";
  for (const p of parts) {
    if (typeof p === "string") {
      out += hash !== undefined ? p.replace(/#/g, hash) : p;
      continue;
    }
    const raw = vars[p.v];
    if (!("kind" in p)) {
      out += raw === undefined || raw === null ? `{${p.v}}` : typeof raw === "number" ? fmtNum(raw, locale) : String(raw);
      continue;
    }
    if (p.kind === "plural") {
      const n = Number(raw ?? 0);
      const branch = p.opts[`=${n}`] ?? p.opts[pluralOf(locale, n)] ?? p.opts.other ?? [];
      out += render(branch, vars, locale, fmtNum(n, locale));
    } else {
      out += render(p.opts[String(raw)] ?? p.opts.other ?? [], vars, locale, hash);
    }
  }
  return out;
}

const compiled = new Map<string, Part[]>();

/** Translate `message` into `locale`, filling in `vars`. */
export function translate(locale: Locale, message: string, vars?: Vars): string {
  const text = (locale !== DEFAULT_LOCALE && catalogs[locale]?.[message]) || message;
  if (!text.includes("{")) return text;
  const key = `${locale}\u0000${text}`;
  let parts = compiled.get(key);
  if (!parts) compiled.set(key, (parts = parse(text)));
  return render(parts, vars ?? {}, locale);
}

/** Translate into the current locale (the request's on the server, the page's in the browser). */
export const t = (message: string, vars?: Vars) => translate(getLocale(), message, vars);

/** Is there a real translation (not the English fallback)? */
export const hasTranslation = (locale: Locale, message: string) => locale === DEFAULT_LOCALE || !!catalogs[locale]?.[message];

/**
 * Marks text for translation without translating it — for data tables defined at import
 * time, before any locale is known. Translate where it's displayed: t(def.name).
 */
export const msg = <T extends string>(s: T): T => s;

// ---------------------------------------------------------------- dates
const dateFmt = new Map<string, Intl.DateTimeFormat>();
/** Dates in the locale's calendar (Solar Hijri for Persian). */
export function fmtDate(d: Date | string | number, opts: Intl.DateTimeFormatOptions, locale: Locale = getLocale()) {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = dateFmt.get(key);
  if (!f) dateFmt.set(key, (f = new Intl.DateTimeFormat(LOCALE_META[locale].intl, opts)));
  return f.format(new Date(d));
}
