// Whose police patrol the 3D city (pure; tests/street.test.ts): Iran's (a Samand, white with the
// green band, «پلیس») in Iran and anywhere the game has no look of its own yet; Turkey's
// (a Renault saloon — the L90 — white with the blue band, «POLİS 155», navy uniforms) in Turkey.
import { countryAt } from "../region";

export type PoliceCountry = "IR" | "TR";
export const policeCountryAt = (at: { lat: number; lng: number }): PoliceCountry => (countryAt(at.lat, at.lng) === "TR" ? "TR" : "IR");
