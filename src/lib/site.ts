import { msg, type Vars } from "./i18n";

export const SITE = {
  name: "StreetQuest",
  tagline: msg("Your city is the game map."),
  description: msg(
    "StreetQuest is a real-world GPS war game. Build a base on your actual streets, train an army, siege rivals and take down roaming bosses — and when enemies are online nearby, the fight drops into first person. Your commander eats, sleeps and socializes too.",
  ),
  // NEXT_PUBLIC_SITE_URL wins; on Vercel fall back to the project's production domain.
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, ""),
  keywords: [msg("GPS game"), msg("location-based game"), msg("real world game"), msg("AR game"), msg("Pokémon GO alternative"), msg("city exploration game"), msg("geocaching"), msg("outdoor game"), msg("courier game"), msg("GPS strategy game"), msg("location-based shooter")],
};

/** The marketing copy in the reader's language. */
export function siteText(t: (message: string, vars?: Vars) => string) {
  return {
    tagline: t(SITE.tagline),
    description: t(SITE.description),
    keywords: SITE.keywords.map((k) => t(k)),
  };
}
