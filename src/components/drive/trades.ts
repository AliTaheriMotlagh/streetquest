// What kind of place a storefront is, from its OpenStreetMap class: the icon, sign colours
// and name shown on its board, its pin over the rooftops and in the Places list.
import { msg } from "@/lib/i18n";

export type Trade = { key: string; emoji: string; bg: [string, string]; fg: string; label: string };

const TRADES: [RegExp, Trade][] = [
  [/^(restaurant|fast_food|food_court|cafe|bakery|ice_cream|confectionery|pastry|deli|juice|bar|pub|coffee|burger|pizza|icecream)$/, { key: "food", emoji: "🍽️", bg: ["#c0392b", "#8e1f14"], fg: "#fff", label: msg("Food & drink") }],
  [/^(pharmacy|chemist|clinic|doctors|dentist|hospital|veterinary|medical_supply|optician|laboratory)$/, { key: "health", emoji: "⚕️", bg: ["#1e8f5a", "#0f5c38"], fg: "#fff", label: msg("Health") }],
  [/^(bank|atm|bureau_de_change|money_lender|insurance)$/, { key: "bank", emoji: "🏦", bg: ["#1f4f9a", "#12305e"], fg: "#fff", label: msg("Bank") }],
  [/^(supermarket|convenience|grocery|greengrocer|butcher|general|kiosk|seafood|dairy|beverages|nuts)$/, { key: "grocery", emoji: "🛒", bg: ["#2e9e44", "#1b6b2c"], fg: "#fff", label: msg("Grocery") }],
  [/^(clothes|clothing_store|shoes|boutique|jewelry|bag|fabric|tailor|fashion|watches)$/, { key: "fashion", emoji: "👗", bg: ["#a83279", "#6e1d4f"], fg: "#fff", label: msg("Clothes & shoes") }],
  [/^(mobile_phone|electronics|computer|telecommunication|hifi|appliance|tech)$/, { key: "tech", emoji: "📱", bg: ["#2c3e50", "#151f29"], fg: "#7fd6ff", label: msg("Phones & electronics") }],
  [/^(hairdresser|beauty|cosmetics|perfumery|massage)$/, { key: "beauty", emoji: "💇", bg: ["#7d3c98", "#4e2560"], fg: "#fff", label: msg("Beauty") }],
  [/^(school|university|college|kindergarten|educational_institution|library|books|stationery)$/, { key: "edu", emoji: "📚", bg: ["#d4a017", "#946f0d"], fg: "#1b1300", label: msg("Books & library") }],
  [/^(place_of_worship|muslim|mosque|christian|church)$/, { key: "worship", emoji: "🕌", bg: ["#17806d", "#0d5248"], fg: "#fff", label: msg("Place of worship") }],
  [/^(hotel|lodging|hostel|guest_house|motel)$/, { key: "hotel", emoji: "🏨", bg: ["#5b2c6f", "#381a45"], fg: "#ffd98a", label: msg("Hotel") }],
  [/^(fuel|car|car_repair|car_parts|tyres|car_wash)$/, { key: "car", emoji: "🚗", bg: ["#e67e22", "#a8560f"], fg: "#fff", label: msg("Cars & fuel") }],
  [/^(fitness_centre|sports_centre|sports|swimming_pool|stadium|gym)$/, { key: "sport", emoji: "💪", bg: ["#c0392b", "#7b2218"], fg: "#fff", label: msg("Gym & sports") }],
  [/^(police|fire_station|townhall|town_hall|courthouse|government|post_office)$/, { key: "civic", emoji: "🏛️", bg: ["#34495e", "#1d2833"], fg: "#fff", label: msg("Public office") }],
  [/^(florist|garden_centre)$/, { key: "flowers", emoji: "💐", bg: ["#27ae60", "#16733f"], fg: "#fff", label: msg("Flowers & garden") }],
  [/^(hardware|doityourself|paint|furniture|interior_decoration|houseware|carpet)$/, { key: "home", emoji: "🔧", bg: ["#8e5a2b", "#5c3817"], fg: "#fff", label: msg("Home & hardware") }],
  [/^(travel_agency|taxi|estate_agent)$/, { key: "travel", emoji: "✈️", bg: ["#2980b9", "#1a5276"], fg: "#fff", label: msg("Travel & agents") }],
  [/^(office|company|lawyer|notary|publisher|ngo|diplomatic|association)$/, { key: "office", emoji: "🏢", bg: ["#4a5560", "#2a3138"], fg: "#e8eef5", label: msg("Office") }],
  [/^(parking)$/, { key: "parking", emoji: "🅿️", bg: ["#1f5fbf", "#123a75"], fg: "#fff", label: msg("Parking") }],
  [/^(cinema|theatre|arts_centre|museum|gallery)$/, { key: "culture", emoji: "🎬", bg: ["#6c3483", "#40204e"], fg: "#ffd98a", label: msg("Cinema & culture") }],
];
const OTHER: Trade = { key: "shop", emoji: "🏪", bg: ["#3d4b59", "#222b33"], fg: "#fff", label: msg("Shop") };

export const tradeOf = (cls = ""): Trade => TRADES.find(([re]) => re.test(cls))?.[1] ?? OTHER;

/** A name with an optional second line ("both" street-name mode: mine, then local). */
export const nameLines = (text: string) => text.split("\n", 2) as [string] | [string, string];
/** The same name on one line, for the HUD and lists. */
export const oneLine = (text: string) => text.replace("\n", " · ");
