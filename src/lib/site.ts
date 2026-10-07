export const SITE = {
  name: "StreetQuest",
  tagline: "Your city is the game map.",
  description:
    "StreetQuest is a real-world GPS war game. Build a base on your actual streets, train an army, siege rivals and take down roaming bosses — and when enemies are online nearby, the fight drops into first person. Your commander eats, sleeps and socializes too.",
  // NEXT_PUBLIC_SITE_URL wins; on Vercel fall back to the project's production domain.
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, ""),
  keywords: ["GPS game", "location-based game", "real world game", "AR game", "Pokémon GO alternative", "city exploration game", "geocaching", "outdoor game", "courier game", "GPS strategy game", "location-based shooter"],
};
