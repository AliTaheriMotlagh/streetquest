import { msg, type Vars } from "./i18n";

export const SITE = {
  name: "StreetQuest",
  tagline: msg("Your city is the game map."),
  description: msg(
    "StreetQuest is a real-world GPS money game. Money appears on your real streets — walk to it and pick it up, or play from home — do missions at real stores, and cash your toman out to your bank card.",
  ),
  // NEXT_PUBLIC_SITE_URL wins; on Vercel fall back to the project's production domain.
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, ""),
  keywords: [msg("GPS game"), msg("location-based game"), msg("real world game"), msg("AR game"), msg("Pokémon GO alternative"), msg("city exploration game"), msg("geocaching"), msg("outdoor game"), msg("courier game"), msg("GPS money game"), msg("earn money walking")],
};

/** The marketing copy in the reader's language. */
export function siteText(t: (message: string, vars?: Vars) => string) {
  return {
    tagline: t(SITE.tagline),
    description: t(SITE.description),
    keywords: SITE.keywords.map((k) => t(k)),
  };
}
