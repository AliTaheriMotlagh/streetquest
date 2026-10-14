// Story missions and GPS mini-games. Pure — safe on client and server.
// Every step happens on real streets: waypoints are placed around wherever the
// player is when the step starts.
import { msg } from "./i18n";

/** go: walk to a marked waypoint · find: hidden spot, hot/cold only · hold: stay inside a zone for a while */
export type StepKind = "go" | "find" | "hold";
export type StoryStep = { kind: StepKind; text: string; minM: number; maxM: number; holdS?: number };
export type StoryChapter = { title: string; emoji: string; intro: string; outro: string; minutes: number; steps: StoryStep[]; reward: { xp: number; coins: number; gems: number; gear?: "common" | "rare" | "epic" | "legendary" } };

export const STORY: StoryChapter[] = [
  {
    title: msg("The Signal"),
    emoji: "📻",
    intro: msg("Static on every channel — then a voice. “If anyone can hear this, the city isn't dead. Find the relay.”"),
    outro: msg("The relay hums to life. Somewhere out there, someone else is listening."),
    minutes: 30,
    steps: [
      { kind: "go", text: msg("Head to the marked rooftop relay."), minM: 120, maxM: 220 },
      { kind: "find", text: msg("The relay's power cell fell somewhere nearby. Use the detector — it beeps hotter as you get close."), minM: 60, maxM: 120 },
    ],
    reward: { xp: 200, coins: 120, gems: 3 },
  },
  {
    title: msg("Dead Drop"),
    emoji: "📦",
    intro: msg("The voice has a name: Mara. “I left supplies for whoever answered. Don't make me regret it.”"),
    outro: msg("Medkits, rations and a hand-drawn map. Mara's handwriting is shaky — she's been hurt."),
    minutes: 30,
    steps: [
      { kind: "go", text: msg("Reach the drop point Mara marked."), minM: 150, maxM: 280 },
      { kind: "hold", text: msg("Militia scouts are sweeping the block. Hold position until they pass."), minM: 0, maxM: 0, holdS: 45 },
      { kind: "find", text: msg("The crate is buried under rubble close by. Find it."), minM: 50, maxM: 110 },
    ],
    reward: { xp: 250, coins: 150, gems: 3, gear: "common" },
  },
  {
    title: msg("Red Smoke"),
    emoji: "🚨",
    intro: msg("Red smoke rises across town — a distress flare. It could be Mara. It could be a trap."),
    outro: msg("It was a trap. You got out — barely — but you saw the insignia on their trucks: the Syndicate."),
    minutes: 35,
    steps: [
      { kind: "go", text: msg("Run toward the flare."), minM: 200, maxM: 350 },
      { kind: "go", text: msg("Ambush! Break line of sight — get to the alley."), minM: 80, maxM: 160 },
      { kind: "hold", text: msg("Lie low until the patrol gives up."), minM: 0, maxM: 0, holdS: 60 },
    ],
    reward: { xp: 300, coins: 180, gems: 4 },
  },
  {
    title: msg("The Informant"),
    emoji: "🕵️",
    intro: msg("A street kid says he knows where the Syndicate keeps its maps — for a price."),
    outro: msg("The maps show depots all over the city. The Syndicate is bigger than anyone thought."),
    minutes: 35,
    steps: [
      { kind: "go", text: msg("Meet the informant at the marked corner."), minM: 150, maxM: 300 },
      { kind: "find", text: msg("He hid the maps and ran. Search the area."), minM: 60, maxM: 130 },
      { kind: "go", text: msg("Get the maps back to a safe spot."), minM: 150, maxM: 260 },
    ],
    reward: { xp: 350, coins: 220, gems: 5, gear: "rare" },
  },
  {
    title: msg("Blackout"),
    emoji: "🔦",
    intro: msg("The Syndicate cut the grid. Every district is dark — except one substation still running on their generators."),
    outro: msg("The lights flicker back on across the neighbourhood. People cheer from their windows."),
    minutes: 40,
    steps: [
      { kind: "go", text: msg("Make for the substation."), minM: 250, maxM: 400 },
      { kind: "hold", text: msg("Plant the override and keep guard while it uploads."), minM: 0, maxM: 0, holdS: 75 },
      { kind: "find", text: msg("One breaker is still tripped somewhere near. Find it in the dark."), minM: 60, maxM: 120 },
    ],
    reward: { xp: 400, coins: 260, gems: 5 },
  },
  {
    title: msg("Mara"),
    emoji: "🩹",
    intro: msg("A new broadcast, weak: “They've got me... east warehouse... hurry.”"),
    outro: msg("You carry Mara out on your shoulder. “Took you long enough,” she grins."),
    minutes: 40,
    steps: [
      { kind: "go", text: msg("Head for the warehouse district."), minM: 250, maxM: 420 },
      { kind: "find", text: msg("Mara is somewhere inside. Follow the faint signal."), minM: 60, maxM: 130 },
      { kind: "go", text: msg("Get her to the safe house."), minM: 200, maxM: 320 },
    ],
    reward: { xp: 500, coins: 300, gems: 6, gear: "rare" },
  },
  {
    title: msg("War Council"),
    emoji: "🗺️",
    intro: msg("Mara gathers the commanders who answered the signal. “We hit the Syndicate's supply lines. All of them. Tonight.”"),
    outro: msg("Three depots burn. The Syndicate knows your name now."),
    minutes: 45,
    steps: [
      { kind: "go", text: msg("Scout the first depot."), minM: 200, maxM: 350 },
      { kind: "go", text: msg("Scout the second depot."), minM: 200, maxM: 350 },
      { kind: "hold", text: msg("Signal the strike team and hold until they hit."), minM: 0, maxM: 0, holdS: 60 },
    ],
    reward: { xp: 600, coins: 350, gems: 8 },
  },
  {
    title: msg("The Kingpin"),
    emoji: "👑",
    intro: msg("The Syndicate's boss is moving across the city in an armored convoy. One chance to intercept."),
    outro: msg("The Kingpin is in chains. The city is yours — for now. Mara hands you the radio: “Keep the signal alive, commander.”"),
    minutes: 50,
    steps: [
      { kind: "go", text: msg("Cut across town to the intercept point."), minM: 300, maxM: 500 },
      { kind: "find", text: msg("The convoy's tracker beacon fell nearby — find it to know their route."), minM: 70, maxM: 140 },
      { kind: "go", text: msg("Get ahead of the convoy."), minM: 200, maxM: 350 },
      { kind: "hold", text: msg("Spring the ambush — hold the line!"), minM: 0, maxM: 0, holdS: 90 },
    ],
    reward: { xp: 1000, coins: 600, gems: 15, gear: "epic" },
  },
];

export type GpsGameKind = "hunt" | "sprint" | "rally" | "story";

export const GPS_GAMES: { kind: Exclude<GpsGameKind, "story">; name: string; emoji: string; blurb: string }[] = [
  { kind: "hunt", name: msg("Treasure Hunt"), emoji: "🧭", blurb: msg("A cache is hidden somewhere around you. No map marker — only a detector that beeps hotter as you get close.") },
  { kind: "sprint", name: msg("Street Sprint"), emoji: "🏃", blurb: msg("Cover the distance on foot before the clock runs out. Any direction — just keep moving.") },
  { kind: "rally", name: msg("Checkpoint Rally"), emoji: "🏁", blurb: msg("Hit every checkpoint in order before time's up. Plan your route!") },
];

/** Hot/cold band for a distance to a hidden spot. */
export function heatOf(d: number) {
  if (d <= 30) return { label: msg("ON FIRE"), emoji: "🔥🔥🔥", level: 5 };
  if (d <= 60) return { label: msg("Hot"), emoji: "🔥🔥", level: 4 };
  if (d <= 110) return { label: msg("Warm"), emoji: "🔥", level: 3 };
  if (d <= 200) return { label: msg("Cool"), emoji: "❄️", level: 2 };
  return { label: msg("Cold"), emoji: "🧊", level: 1 };
}

export const FIND_RADIUS_M = 25;
export const HOLD_RADIUS_M = 45;
export const MAX_REROUTES = 3;
