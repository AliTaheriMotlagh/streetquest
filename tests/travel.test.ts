import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookUrl, CITIES, cityByKey, cityHas, dayPartOf, filterStays, filterTrips, findCities, fromAlibabaBuses, fromAlibabaFlights, fromAlibabaTrains, fromJabama, fromMrbilitFlights, fromMrbilitTrains,
  jalaliIso, mergeTrips, nearestCity, normFa, toJalali, tripFacets, type Route,
} from "../src/lib/travel";

const route = (): Route => ({ from: cityByKey("tehran")!, to: cityByKey("mashhad")!, date: "2026-11-20" });

test("cities: stations, bus cities and airports merged by name", () => {
  const teh = cityByKey("tehran")!;
  assert.equal(teh.iata, "THR");
  assert.equal(teh.train, 1);
  assert.equal(teh.bus, 11320000);
  assert.equal(teh.province, "تهران");
  assert.ok(teh.lat && teh.lng);
  const mhd = cityByKey("mashhad")!;
  assert.deepEqual([mhd.iata, mhd.train, mhd.bus], ["MHD", 191, 31310000]);
  assert.ok(cityByKey("isfahan")?.bus, "Isfahan's 'all terminals' entry is the city");
  assert.equal(cityByKey("kermanshah")?.iata, "KSH", "Alibaba's 'Kerman' for KSH is fixed");
  // Terminals aren't cities; keys are unique.
  assert.ok(!CITIES.some((c) => /پایانه/.test(c.fa)));
  assert.equal(new Set(CITIES.map((c) => c.key)).size, CITIES.length);
  assert.ok(cityHas(teh, "flight") && cityHas(teh, "train") && cityHas(teh, "bus"));
  assert.ok(!cityHas(cityByKey("kish")!, "train"));
});

test("finding cities in Persian, English, by airport code; nearest city", () => {
  assert.equal(findCities("مشهد")[0].key, "mashhad");
  assert.equal(findCities("shir")[0].key, "shiraz");
  assert.equal(findCities("IFN")[0].key, "isfahan");
  assert.equal(findCities("كيش")[0].key, "kish", "Arabic letters fold to Persian");
  assert.ok(findCities("").length > 5, "popular cities with nothing typed");
  assert.equal(nearestCity({ lat: 35.7, lng: 51.4 })?.key, "tehran");
  assert.equal(nearestCity({ lat: 48.85, lng: 2.35 }), null, "Paris is not an Iranian city");
  assert.equal(normFa("بندر عباس"), normFa("بندرعباس"));
});

test("Jalali dates for Alibaba's links", () => {
  assert.deepEqual(toJalali(2026, 3, 21), [1405, 1, 1]);
  assert.equal(jalaliIso("2026-11-20"), "1405-08-29");
  assert.equal(jalaliIso("2025-03-20"), "1403-12-30");
  assert.equal(bookUrl("alibaba", "flight", route()), "https://www.alibaba.ir/flights/THR-MHD?adult=1&child=0&infant=0&departing=1405-08-29");
  assert.equal(bookUrl("alibaba", "bus", route()), "https://www.alibaba.ir/bus/11320000-31310000?departing=1405-08-29");
  assert.match(bookUrl("mrbilit", "train", route()), /mrbilit\.com\/trains\/tehran-mashhad\?departureDate=2026-11-20/);
});

const aliFlights = { result: { departing: [
  { airlineCode: "B9", flightNumber: "960", leaveDateTime: "2026-11-20T08:00:00", arrivalDateTime: "2026-11-20T09:30:00", aircraft: "Airbus A320", priceAdult: 60010100, seat: 7, classTypeName: "اکونومی", isCharter: false, isRefundable: true, maxAllowedBaggage: 20, terminal: "2" },
  { airlineCode: "IR", flightNumber: "403", leaveDateTime: "2026-11-20T21:00:00", arrivalDateTime: "2026-11-20T22:20:00", priceAdult: 52000000, seat: 0, classTypeName: "اکونومی" },
] } };
const mbFlights = { Flights: [
  { Segments: [{ Legs: [{ FlightNumber: "960", AirlineCode: "B9", Airline: { PersianTitle: "ایران ایرتور", Logo: "https://x/B9.svg" }, OriginAirport: "مهرآباد", DestinationAirport: "هاشمی نژاد", DepartureTime: "2026-11-20T08:00:00+03:30", ArrivalTime: "2026-11-20T09:30:00+03:30", AirCraft: { PersianTitle: "ایرباس A320" } }] }],
    Prices: [{ Capacity: 9, CabinClass: "Economy", CabinClassDisplayName: "اکونومی", Baggage: 20, PassengerFares: [{ PaxType: "ADL", TotalFare: 58000000 }] }, { Capacity: 2, CabinClass: "Business", CabinClassDisplayName: "بیزینس", PassengerFares: [{ PaxType: "ADL", TotalFare: 100703000 }] }] },
] };

test("flights from two sites are one row each, cheapest site first", () => {
  const r = route();
  const a = fromAlibabaFlights(aliFlights, r), m = fromMrbilitFlights(mbFlights, r);
  assert.equal(a[0].price, 6001010, "rials → toman");
  assert.equal(a[0].minutes, 90);
  assert.equal(m.length, 2, "economy and business are two trips");
  const all = mergeTrips([a, m]);
  assert.equal(all.length, 3);
  const b9 = all.find((x) => x.id.startsWith("flight:B9960:") && x.klass === "اکونومی")!;
  assert.deepEqual(b9.offers.map((o) => o.source), ["mrbilit", "alibaba"]);
  assert.equal(b9.price, 5800000);
  assert.equal(b9.seats, 9, "the larger seat count");
  assert.equal(b9.refundable, true, "filled in from the other site");
  // Filters and order.
  assert.deepEqual(filterTrips(all, { sort: "early" }).map((x) => x.depart.slice(11, 16)), ["08:00", "08:00", "21:00"]);
  assert.equal(filterTrips(all, { seatsOnly: true }).length, 2, "the full flight is out");
  assert.equal(filterTrips(all, { parts: ["evening"] }).length, 1);
  assert.equal(filterTrips(all, { max: 6_000_000 }).length, 2);
  assert.equal(filterTrips(all, { q: "ایرتور" }).length, 2);
  assert.equal(dayPartOf("2026-11-20T05:59:00"), "night");
  const f = tripFacets(all);
  assert.equal(f.cheapest.flight, 5200000);
});

test("trains (MrBilit's classes, Alibaba's wagons) and buses", () => {
  const r = route();
  const mb = fromMrbilitTrains({ Trains: [{ TrainNumber: 166, DepartureTime: "2026-11-20T18:45:00", ArrivalTime: "2026-11-21T05:10:00", CorporationName: "ریل سیر کوثر", Cancellable: true, Prices: [{ Classes: [{ Price: 29522000, Capacity: 1, WagonName: "5 ستاره زمرد", IsCompartment: true, CompartmentCapacity: 4, AirConditioning: true, IsAvailable: true }, { Price: 1, IsAvailable: false }] }] }] }, r);
  assert.equal(mb.length, 1);
  assert.equal(mb[0].minutes, 625);
  const al = fromAlibabaTrains({ departing: [{ trainNumber: 166, wagonName: "5 ستاره زمرد.", departureDateTime: "2026-11-20T18:45:00", arrivalDateTime: "2026-11-21T05:10:00", cost: 28000000, fullPrice: 30000000, isCompartment: true, compartmentCapacity: 4, seat: 3, companyName: "ریل سیر کوثر" }] }, r);
  const both = mergeTrips([mb, al]);
  assert.equal(both.length, 1, "same train, same wagon kind on both sites");
  assert.equal(both[0].price, 2800000);
  assert.equal(both[0].offers.length, 2);
  const bus = fromAlibabaBuses({ result: { availableList: [{ companyName: "همسفر  چابکسواران", departureDateTime: "2026-11-20T22:00:00", price: 13000000, beforeDiscountPrice: 14000000, availableSeats: 17, busType: "VIP", destinationTerminal: "پایانه امام رضا", distance: 900 }] } }, r);
  assert.equal(bus[0].price, 1300000);
  assert.equal(bus[0].was, 1400000);
  assert.equal(bus[0].company, "همسفر چابکسواران");
});

test("stays from Jabama, filtered and sorted", () => {
  const item = (code: number, price: number, type: string, cap: number, score?: number) => ({ kind: "accommodation", code, name: `رزرو ${type} ${code}`, type, image: "p.jpg", location: { city: "مشهد", geo: { lat: 36.29, long: 59.6 } }, price: { perNight: price, discountedPrice: price, mainPrice: price + 10 }, capacity: { base: cap, extra: 0 }, rate_review: score ? { score, count: 10 } : null, reservation_type: code % 2 ? "instant" : "preApprove" });
  const stays = fromJabama({ result: { items: [item(1, 30000000, "suite", 5, 4.5), item(2, 80000000, "villa", 10), item(3, 15000000, "apartment", 2, 3.9), { kind: "ad" }] } }, { lat: 36.3, lng: 59.6 });
  assert.equal(stays.length, 3);
  assert.equal(stays[0].name, "suite 1", "'رزرو' is dropped");
  assert.equal(stays[0].price, 3000000);
  assert.equal(stays[0].url, "https://www.jabama.com/stay/suite-1");
  assert.deepEqual(filterStays(stays).map((s) => s.kind), ["apartment", "suite", "villa"]);
  assert.deepEqual(filterStays(stays, { guests: 4, sort: "dear" }).map((s) => s.kind), ["villa", "suite"]);
  assert.deepEqual(filterStays(stays, { instant: true }).map((s) => s.kind).sort(), ["apartment", "suite"]);
  assert.equal(filterStays(stays, { sort: "rating" })[0].kind, "suite");
});

test("Jabama hotels (their own list): stars, amenities, no code, price from min_price", () => {
  const hotel = { kind: "hotel", code: 0, id: "ABH_dh-10fd", name: "رزرو هتل رونیا", type: "hotel", star: 4, image: "h.jpg", location: { city: "تهران", geo: { lat: 35.77, long: 51.42 } }, price: { perNight: null, discountedPrice: 40500000, mainPrice: 40500000 }, min_price: 40500000, amenities: [{ name: "swimming pool" }, { name: "parking" }, { name: "wifi available in all areas" }, { name: "restaurant" }], rate_review: { score: 5, count: 1 }, reservation_type: "instant" };
  const inn = { kind: "accommodation", code: 9, name: "اجاره مسافرخانه نور", type: "inn", image: "i.jpg", price: { perNight: 9000000, discountedPrice: 9000000 }, capacity: { base: 2, extra: 0 } };
  const stays = fromJabama({ result: { items: [hotel, inn] } }, null, "tehran");
  assert.equal(stays.length, 2);
  const [h, i] = stays;
  assert.equal(h.kind, "hotel");
  assert.equal(h.id, "jabama:ABH_dh-10fd", "code 0 → the id");
  assert.equal(h.name, "هتل رونیا");
  assert.equal(h.price, 4050000);
  assert.equal(h.stars, 4);
  assert.equal(h.url, "https://www.jabama.com/hotels-tehran");
  assert.deepEqual(h.amenities, ["pool", "parking", "wifi", "restaurant"]);
  assert.equal(i.kind, "hostel");
  assert.equal(i.name, "مسافرخانه نور", "'اجاره' is dropped too");
  assert.deepEqual(filterStays(stays, { minStars: 3 }).map((s) => s.kind), ["hotel"]);
  assert.deepEqual(filterStays(stays, { amenities: ["pool", "wifi"] }).map((s) => s.kind), ["hotel"]);
  assert.equal(filterStays(stays, { sort: "stars" })[0].kind, "hotel");
});

test("travel hubs on the map: airports from the country view, stations then buses as you zoom in", async () => {
  const { hubGlyphs } = await import("../src/lib/travel");
  const mashhad = { iata: "MHD", train: 191, bus: 1, lat: 36.3 };
  assert.deepEqual(hubGlyphs(mashhad, 5), ["✈️"]);
  assert.deepEqual(hubGlyphs(mashhad, 6), ["✈️", "🚆"]);
  assert.deepEqual(hubGlyphs(mashhad, 9), ["✈️", "🚆", "🚌"]);
  assert.deepEqual(hubGlyphs({ bus: 2, lat: 35 }, 6), [], "a bus-only town waits for a closer zoom");
  assert.deepEqual(hubGlyphs({ iata: "X" }, 9), [], "no position, no pin");
});
