// The public feature pages (/features, /features/<slug>; pure — the pages, the sitemap and tests/features.test.ts).
//
// Most of StreetQuest lives inside /play, which crawlers may not open (robots.txt: it would sign them up as guests) and
// which is noindex — so without these pages a search for "drive in Tehran in 3D" or «مسیریابی مترو تهران» never finds
// the game. Each page says what one part does, in words people search with, and links straight into it. Every claim
// here is something the game really does (README.md has the details); keep it that way when editing.
import { msg } from "./i18n";
import type { IconName } from "./iconPaths";

export type Feature = {
  slug: string;
  icon: IconName;
  /** <title> and the card's name. */
  title: string;
  /** The meta description (≤ ~160 characters in every language). */
  description: string;
  h1: string;
  intro: string;
  /** What you can do there: [heading, text]. */
  points: [string, string][];
  faq: [string, string][];
  /** Where the button takes you inside the game. */
  play: string;
  cta: string;
};

export const FEATURES: Feature[] = [
  {
    slug: "3d-city",
    icon: "car",
    title: msg("Drive your real city in 3D"),
    description: msg("Drive a car through your own streets in 3D: real buildings, shops, street names, traffic and people, day and night. Free in your browser."),
    h1: msg("Drive through your own city in 3D"),
    intro: msg("StreetQuest builds the streets around you in 3D from the open map: real building shapes and heights, roads, parks, water and shop signs. Pick a car and drive through your neighbourhood — or anywhere — right in the browser."),
    points: [
      [msg("Real streets, real shops"), msg("Every street, bridge and shop front is where it really is. Lit store signs read from across the street, and open shops have a shopkeeper inside.")],
      [msg("Traffic and people"), msg("Cars stop at lights and jams, people walk the pavements and react to what you do. Get out, walk, talk to anyone or walk into a store.")],
      [msg("Iranian cars and streets"), msg("Drive a Pride, a Peugeot, a Tiba, a Shahin or the city bus, past post boxes, median railings, footbridges and saqakhanehs.")],
    ],
    faq: [
      [msg("Do I need to download anything?"), msg("No. The 3D city runs in your phone's or computer's browser. It adjusts its graphics to your device so it stays smooth.")],
      [msg("Which cities can I drive in?"), msg("Any city on Earth: the streets come from the open map. Tehran and Istanbul have the most detail.")],
    ],
    play: "/play?drive=1",
    cta: msg("Drive now"),
  },
  {
    slug: "street-arena",
    icon: "target",
    title: msg("Street Arena: multiplayer shooter on real streets"),
    description: msg("An online multiplayer shooter on your real streets: deathmatch, team deathmatch, bomb defusal, gun game and hardpoint with players nearby. Free."),
    h1: msg("Street Arena — online matches on your own streets"),
    intro: msg("In the 3D city everyone driving or walking nearby shows up live. Start a match and your neighbourhood becomes the arena: teams, weapons, medals and a scoreboard, played with real people around you."),
    points: [
      [msg("Live with players nearby"), msg("Other players' cars and characters move live, many times a second. Invite friends to a party and join a match together.")],
      [msg("Five match modes"), msg("Deathmatch, team deathmatch, bomb defusal, gun game and hardpoint, with weapons to pick and medals for headshots and kill streaks.")],
      [msg("Opt-in fighting"), msg("In the open city nobody can shoot you unless you choose to fight. Matches are separate and end with a scoreboard.")],
    ],
    faq: [
      [msg("Is Street Arena free?"), msg("Yes. It runs in the browser on phones and computers, with no download and no sign-up needed to try it.")],
      [msg("Can I play with my friends?"), msg("Yes. Make a party in the 3D city, invite friends, and start or join a match together.")],
    ],
    play: "/play?drive=1",
    cta: msg("Play a match"),
  },
  {
    slug: "stores-prices",
    icon: "store",
    title: msg("Stores, menus and prices near you"),
    description: msg("Find restaurants, cafés, groceries and shops near you with their menus, prices, opening hours, reviews and deals — on a list or on the map."),
    h1: msg("Stores, menus and prices near you"),
    intro: msg("Search what's around you: restaurants, cafés, bakeries, groceries, pharmacies and shops. Each store's card shows what it sells and for how much, when it's open and what people say — gathered from the sites that know it."),
    points: [
      [msg("Menus and prices"), msg("Restaurant menus with prices, walk-in stores selling a product, and second-hand ads near you, each with its source.")],
      [msg("Open now and reviews"), msg("Opening hours, ratings and reviews, and directions with the map app you like.")],
      [msg("List or map"), msg("Use the list for shopping only, or see everything on the map. No game needed.")],
    ],
    faq: [
      [msg("Where does the price data come from?"), msg("From public store and delivery sites, cached and credited on every card. Prices are in toman in Iran.")],
      [msg("Does it work outside Iran?"), msg("Yes. Store cards work anywhere; in Turkey they use Turkish sources.")],
    ],
    play: "/play?view=list",
    cta: msg("Find stores near me"),
  },
  {
    slug: "travel",
    icon: "plane",
    title: msg("Trip planner: flights, trains, buses and stays"),
    description: msg("Plan a trip across cities: compare flight, train, bus and car (with fuel cost) side by side, add nights in each city and find stays."),
    h1: msg("Plan a whole trip in one place"),
    intro: msg("Start from your city, add the cities you want to see and how many nights in each. Every leg compares flight, train, bus and your own car side by side — the cheapest, the fastest and the price for everyone."),
    points: [
      [msg("Every way to get there"), msg("Flights, trains and buses with prices and times, and the car's road distance, hours and fuel cost at today's fuel prices.")],
      [msg("Stays in each city"), msg("Hotels and rentals for the nights you pick, and the trip drawn on a map.")],
      [msg("Real planes on the map"), msg("Airports, stations and the rail network on the map, with planes flying live.")],
    ],
    faq: [
      [msg("Can I buy tickets here?"), msg("The planner finds and compares them; you book on the seller's own site, which opens from each result.")],
      [msg("How is the car's fuel cost worked out?"), msg("From the road distance, an average consumption and the current fuel price, including the cheaper quota prices if your fuel card still has quota.")],
    ],
    play: "/play?view=list",
    cta: msg("Plan a trip"),
  },
  {
    slug: "metro",
    icon: "train",
    title: msg("Metro and bus routes: Tehran and Istanbul"),
    description: msg("Metro trips step by step in Tehran and Istanbul: lines, where to change, next trains and every stop, plus bus stops and their lines near you."),
    h1: msg("Metro and buses, step by step"),
    intro: msg("Pick where you are and where you're going: StreetQuest shows the whole trip — walk in, which line and which way, where to change, every stop on the way and where to get off — with leave and arrive times."),
    points: [
      [msg("Every station on the map"), msg("Metro, tram and funicular stations in their line's colour, and the bus stops around you.")],
      [msg("Next trains and buses"), msg("A station's card lists its lines and the next trains each way; a bus stop lists every line that stops there and when it comes.")],
      [msg("Live buses in Istanbul"), msg("In Istanbul buses are shown live; elsewhere timetables come from the city's published schedule — never a made-up number.")],
    ],
    faq: [
      [msg("Which cities have metro routes?"), msg("Tehran and Istanbul today, with every metro, tram and funicular line.")],
      [msg("Is it free?"), msg("Yes, in your browser with no app to install.")],
    ],
    play: "/play?view=map",
    cta: msg("Open the metro map"),
  },
  {
    slug: "earn-money",
    icon: "wallet",
    title: msg("Earn money walking: a real-world GPS game"),
    description: msg("Money appears on your real streets: walk to it, pick it up, do missions at real stores and cash your toman out to your bank card."),
    h1: msg("Pick up real money on your streets"),
    intro: msg("StreetQuest puts money on the map around you. Walk there with GPS and it's yours — or play from home for smaller amounts — then cash out to your bank card once your wallet is full enough."),
    points: [
      [msg("Money around you"), msg("New money appears around you on the map every 20 minutes, with special gold drops on busy streets.")],
      [msg("Store missions"), msg("Check in at a café or bakery, or carry an order across town, for more toman.")],
      [msg("Cash out to your card"), msg("Reach the payout amount and ask for a payout to your card or Sheba number. We check it and pay it.")],
    ],
    faq: [
      [msg("Is it really free?"), msg("Yes. Playing is free in any modern mobile browser; nothing is needed to start.")],
      [msg("Does it work in my city?"), msg("Yes. Money appears from GPS coordinates, so it's everywhere on Earth, from big cities to small towns.")],
    ],
    play: "/play",
    cta: msg("Start playing"),
  },
];

export const featureBySlug = (slug: string) => FEATURES.find((f) => f.slug === slug) ?? null;
