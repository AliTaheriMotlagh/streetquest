// Where in the world a store is, as far as words go (pure; tests/region.test.ts): the country from
// its coordinates (coarse boxes — enough to pick a language, never used for anything that must be
// exact) and the words a local would type to find its menu or its phone number, and which map to
// open. StreetQuest's richest sources (Snappfood, Torob, Divar, Balad) are Iran's; everywhere
// else the open map's data and these localized searches carry the store card.

export type Country = "IR" | "TR" | "IQ" | "AE" | "SA" | "AF" | "AZ" | "AM" | "GE" | "DE" | "GB" | "FR" | "NL" | "SE" | "US" | "CA" | "OTHER";

/** [country, south, west, north, east] — first match wins, so the ones carved out of others come first. */
const BOXES: [Country, number, number, number, number][] = [
  ["AZ", 38.4, 44.8, 41.9, 50.4],
  ["AM", 38.8, 43.4, 41.3, 46.6],
  ["GE", 41.0, 40.0, 43.6, 46.7],
  ["AE", 22.6, 51.5, 26.1, 56.4],
  ["IR", 25.0, 44.0, 39.8, 63.4],
  ["TR", 35.8, 25.6, 42.2, 44.8],
  ["IQ", 29.0, 38.8, 37.4, 48.6],
  ["SA", 16.3, 34.5, 32.2, 55.7],
  ["AF", 29.4, 60.5, 38.5, 74.9],
  ["NL", 50.7, 3.3, 53.6, 7.3],
  ["DE", 47.2, 5.8, 55.1, 15.1],
  ["FR", 41.3, -5.2, 51.1, 8.3],
  ["GB", 49.9, -8.7, 60.9, 1.8],
  ["SE", 55.3, 10.9, 69.1, 24.2],
  ["CA", 49.0, -141, 83.2, -52.6],
  ["US", 24.4, -125, 49.4, -66.9],
];

export function countryAt(lat: number, lng: number): Country {
  // The Iran–Iraq border, roughly, where the two boxes overlap: Basra and Baghdad are Iraq;
  // Ahvaz, Ilam, Kermanshah, Baneh and Urmia are Iran.
  if (lng >= 38.8 && lat > 29 && lat < 37.3) {
    const edge = lat < 33 ? 48 : lat < 35.5 ? 45.5 : lat < 36.5 ? 45.6 : 45.0;
    if (lng < edge) return "IQ";
  }
  // …and the Iran–Afghanistan border, about 61°E: Mashhad, Taybad, Sarakhs and Zabol are Iran; Herat is Afghanistan.
  if (lat > 29.4 && lat < 37.5 && lng < 63.4) {
    const edge = lat < 31.8 ? 61.7 : lat < 33 ? 60.9 : lat < 35.5 ? 61.0 : 61.3;
    if (lng > edge) return "AF";
  }
  for (const [c, s, w, n, e] of BOXES) if (lat >= s && lat <= n && lng >= w && lng <= e) return c;
  return "OTHER";
}

export type Lang = "fa" | "tr" | "ar" | "en" | "de" | "fr" | "nl" | "sv" | "az" | "ka" | "hy" | "ps";
const LANG: Record<Country, Lang> = { IR: "fa", AF: "fa", TR: "tr", IQ: "ar", AE: "ar", SA: "ar", AZ: "az", AM: "hy", GE: "ka", DE: "de", FR: "fr", NL: "nl", SE: "sv", GB: "en", US: "en", CA: "en", OTHER: "en" };
/**
 * The outside sources that know one country only, and that country. Each is asked, and each
 * layer, chip and tab it fills is shown, only there: Iran's in Iran, Turkey's in Turkey (the
 * open map, Google, traffic and radio are worldwide and aren't listed).
 */
export const SOURCE_COUNTRY = {
  snappfood: "IR", torob: "IR", divar: "IR", takhfifan: "IR", balad: "IR", cinematicket: "IR",
  sheypoor: "IR", basalam: "IR", okala: "IR", netbarg: "IR", bilbooard: "IR", irangaah: "IR",
  yemeksepeti: "TR", getir: "TR",
} as const satisfies Record<string, Country>;
export type CountrySource = keyof typeof SOURCE_COUNTRY;
/** Whether a one-country source answers at a point. Before a position is known (0,0 or none) Iran is assumed, as wordsAt does. */
export function sourceAt(source: CountrySource, at: { lat: number; lng: number } | null | undefined): boolean {
  const c = at && (at.lat || at.lng) ? countryAt(at.lat, at.lng) : "IR";
  return SOURCE_COUNTRY[source] === c;
}
/** The food-delivery site that has menus at a point (Snappfood in Iran, Yemeksepeti in Turkey), or null. */
export const deliveryAt = (at: { lat: number; lng: number } | null | undefined): "snappfood" | "yemeksepeti" | null =>
  sourceAt("snappfood", at) ? "snappfood" : sourceAt("yemeksepeti", at) ? "yemeksepeti" : null;

export const langAt = (lat: number, lng: number): Lang => LANG[countryAt(lat, lng)];

/** What a local types after a store's name to find its menu or its number. */
const WORDS: Record<Lang, { menu: string; phone: string }> = {
  fa: { menu: "منو", phone: "تلفن" },
  tr: { menu: "menü", phone: "telefon" },
  ar: { menu: "قائمة الطعام", phone: "رقم الهاتف" },
  en: { menu: "menu", phone: "phone number" },
  de: { menu: "Speisekarte", phone: "Telefonnummer" },
  fr: { menu: "menu", phone: "téléphone" },
  nl: { menu: "menukaart", phone: "telefoonnummer" },
  sv: { menu: "meny", phone: "telefonnummer" },
  az: { menu: "menyu", phone: "telefon" },
  ka: { menu: "მენიუ", phone: "ტელეფონი" },
  hy: { menu: "ճաշացանկ", phone: "հեռախոս" },
  ps: { menu: "مینو", phone: "د تلیفون شمېره" },
};
export const wordsAt = (at: { lat: number; lng: number } | null | undefined) => WORDS[at && (at.lat || at.lng) ? langAt(at.lat, at.lng) : "fa"];

/** The local map to look a place up on: Balad in Iran (it knows Iranian shops best), Google Maps elsewhere. */
export function mapSearch(name: string, at: { lat: number; lng: number } | null | undefined): { site: "balad" | "google"; url: string } {
  const q = encodeURIComponent(name.trim());
  if (!at || (!at.lat && !at.lng) || countryAt(at.lat, at.lng) === "IR") return { site: "balad", url: `https://balad.ir/search?query=${q}` };
  return { site: "google", url: `https://www.google.com/maps/search/${q}/@${at.lat.toFixed(5)},${at.lng.toFixed(5)},17z` };
}
