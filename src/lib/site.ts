export const SITE = {
  name: "StreetQuest",
  tagline: "Your city is the game map.",
  description:
    "StreetQuest is a real-world GPS adventure game. Run missions on your actual streets, crack chests, deliver real packages for coins, leave messages at places, and team up with friends at live events — anywhere on Earth.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  keywords: ["GPS game", "location-based game", "real world game", "AR game", "Pokémon GO alternative", "city exploration game", "geocaching", "outdoor game", "courier game"],
};
