// Your own steps in a trip (pure; tests/travelExtras.test.ts): paste any booking link — a concert, a tour,
// a restaurant, a ticket the game doesn't read — give it a day and a price, and it joins the diary, the
// bill and the final list. The site is told from the link's host.
import { cityByKey } from "./index";

export type Step = { id: string; date: string; city?: string; title: string; url: string; site: string; price: number; people: number };
export const MAX_STEPS = 30;

/** Booking sites the game knows by their host (the travel adapters, the sites it reads, a few more). */
const HOSTS: [RegExp, string][] = [
  [/(^|\.)alibaba\.ir$/, "Alibaba"],
  [/(^|\.)mrbilit\.(com|ir)$/, "MrBilit"],
  [/(^|\.)jabama\.(com|events)$/, "Jabama"],
  [/(^|\.)3click\.com$/, "3click"],
  [/(^|\.)sepehr360\.ir$/, "Sepehr360"],
  [/(^|\.)flytoday\.ir$/, "Flytoday"],
  [/(^|\.)snapptrip\.com$/, "Snapptrip"],
  [/(^|\.)ghasedak24\.com$/, "Ghasedak24"],
  [/(^|\.)safar724\.com$/, "Safar724"],
  [/(^|\.)raja\.ir$/, "Raja (railways)"],
  [/(^|\.)payaneh\.ir$/, "Payaneh"],
  [/(^|\.)eghamat24\.com$/, "Eghamat24"],
  [/(^|\.)otaghak\.com$/, "Otaghak"],
  [/(^|\.)jajiga\.com$/, "Jajiga"],
  [/(^|\.)shab\.ir$/, "Shab"],
  [/(^|\.)evand\.com$/, "Evand"],
  [/(^|\.)tiwall\.com$/, "Tiwall"],
  [/(^|\.)vadoostan\.ir$/, "Vadoostan"],
  [/(^|\.)emruzkojaberam\.com$/, "Emruzkojaberam"],
  [/(^|\.)cinematicket\.org$/, "Cinematicket"],
  [/(^|\.)takhfifan\.com$/, "Takhfifan"],
  [/(^|\.)booking\.ir$/, "Booking.ir"],
];

/** A pasted link, checked: an http(s) URL (a link inside other text is found), its site's name and a title guess. Null: no link in it. */
export function stepFromUrl(text: string): { url: string; site: string; title: string } | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text.trim());
  if (!m) return null;
  let u: URL;
  try {
    u = new URL(m[0].replace(/[).,،]+$/, ""));
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const site = HOSTS.find(([re]) => re.test(host))?.[1] ?? host;
  // The last readable part of the path ("/events/concert-xyz" → "concert xyz"), else the site.
  const seg = u.pathname.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } }).reverse().find((p) => /\p{L}{3,}/u.test(p) && !/\.(html?|php|aspx?)$/i.test(p));
  const title = seg ? seg.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : site;
  return { url: u.toString(), site, title };
}

/** Steps read back from storage or a link: only what makes sense survives. */
export function cleanSteps(v: unknown): Step[] {
  return (Array.isArray(v) ? v : [])
    .filter((s): s is Step => !!s && typeof s.id === "string" && typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && typeof s.url === "string" && !!stepFromUrl(s.url))
    .slice(0, MAX_STEPS)
    .map((s) => ({
      id: s.id.slice(0, 40), date: s.date, ...(typeof s.city === "string" && cityByKey(s.city) ? { city: s.city } : {}),
      title: String(s.title ?? "").slice(0, 120) || stepFromUrl(s.url)!.title, url: stepFromUrl(s.url)!.url, site: stepFromUrl(s.url)!.site,
      price: Math.max(0, Math.min(1e10, Math.round(Number(s.price) || 0))), people: Math.max(1, Math.min(9, Math.round(Number(s.people) || 1))),
    }));
}

/** What the steps cost everyone (each step's price × its people). */
export const stepsCost = (steps: Step[] = []) => steps.reduce((sum, s) => sum + s.price * s.people, 0);

