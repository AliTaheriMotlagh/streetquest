// Which art-kit icon stands in for each emoji. The game's text (UI, server messages,
// translations, data tables) keeps using emoji as a compact, translatable shorthand;
// the art layer swaps them for the drawn icons when they're shown. Keys are stored
// without the emoji variation selector (U+FE0F).
const MAP: Record<string, string> = {
  // money & rewards
  "🪙": "coin", "💎": "gem", "💠": "crystal", "🔷": "diamondBlue", "🏆": "trophy", "⭐": "star", "🌟": "star", "✨": "sparkles",
  "👑": "crown", "🎁": "gift", "🧰": "chest", "📦": "box", "💰": "moneybag", "💵": "cash", "💳": "card", "🔩": "scrap",
  "❤": "heart", "♥": "heart", "⚡": "bolt", "🔥": "fire", "🎖": "medal", "🏅": "medal", "🥇": "gold1", "🥈": "silver2", "🥉": "bronze3",
  "🎟": "ticket", "🎫": "ticket", "🎰": "slot", "🎲": "dice", "🎉": "party", "🎊": "party", "🛡": "shield",
  // combat
  "⚔": "swords", "🗡": "sword", "🔫": "gun", "💣": "bomb", "🧨": "dynamite", "💥": "boom", "💀": "skull", "☠": "skullBones",
  "🎯": "target", "🚩": "flagRed", "🏴": "flagBlack", "🏳": "flagWhite", "🏴‍☠": "flagPirate", "🏁": "flagChecker",
  "🪖": "helmet", "⛑": "medicHelmet", "🗼": "tower", "🚀": "rocket", "☢": "radioactive", "☣": "biohazard",
  "🛰": "satellite", "📡": "dish", "✈": "plane", "🛩": "plane", "🛸": "ufo", "🪂": "parachute", "💉": "syringe", "🦺": "vest",
  // world
  "🏰": "castle", "🏯": "castle", "🏙": "bizTower", "🌃": "bizTower", "🏪": "shop", "🏬": "shop", "🛍": "bags", "🛒": "cart", "🏛": "bank", "🏦": "bank", "🏭": "factory",
  "🏠": "house", "🏡": "house", "🏚": "ruin", "⛺": "tent", "🧱": "bricks", "🚧": "construction", "🏗": "crane",
  "🌙": "moon", "🌛": "moon", "☀": "sun", "🌞": "sun", "🌅": "sunrise", "🌄": "sunrise", "🌇": "sunset", "🌆": "sunset", "🔆": "particle",
  "🌍": "globe", "🌎": "globe", "🌏": "globe", "🌐": "web", "🗺": "map", "📍": "pin", "📌": "pin", "🧭": "compass", "🛢": "oil",
  "🚗": "car", "🚘": "car", "🚙": "carBlue", "🛻": "carOrange", "🚕": "taxi", "🚖": "taxi", "🏎": "raceCar", "🚚": "truck", "🚛": "truck",
  "🛹": "skateboard", "👟": "sneaker", "🚶": "sneaker", "🏃": "sneaker", "🥾": "boot", "⌚": "watch", "⚙": "gear",
  // objects & UI
  "🔒": "lock", "🔐": "lock", "🔓": "unlock", "✅": "check", "☑": "checkBox", "➕": "plus", "⏸": "pause", "▶": "play", "⏯": "play",
  "🔁": "repeat", "🔄": "refresh", "🔀": "shuffle", "⬆": "up", "↩": "undo", "🟦": "square",
  "🟡": "orbYellow", "🔵": "orbBlue", "🟣": "orbPurple", "🟢": "orbGreen", "🔴": "orbRed", "⚫": "orbBlack", "🟠": "orbOrange",
  "🚫": "no", "⛔": "no", "⚠": "warning", "🔔": "bell", "🔕": "bellOff", "💬": "chat", "🗨": "chat", "📜": "scroll",
  "📖": "book", "📚": "books", "📒": "ledger", "📓": "ledger", "🎒": "backpack", "👥": "people", "🧍": "person", "👤": "person",
  "📣": "megaphone", "📢": "megaphone", "📯": "horn", "🔊": "speaker", "🔉": "speaker", "🔈": "speaker", "🔇": "mute",
  "⏳": "hourglass", "⌛": "hourglass", "⏰": "alarm", "⏱": "stopwatch", "⏲": "stopwatch", "💾": "floppy", "📻": "radio",
  "📺": "tv", "📹": "video", "🎥": "video", "🎬": "clapper", "📸": "camera", "📷": "camera", "📞": "phone", "☎": "phone",
  "📱": "mobile", "📲": "mobile", "📵": "mobileOff", "📴": "mobileOff", "💻": "laptop", "🖼": "picture", "👁": "eye", "👀": "eyes",
  "🗑": "trash", "♻": "recycle", "🔭": "telescope", "🔬": "microscope", "🗓": "calendar", "📅": "calendar", "📆": "calendar",
  "🔍": "search", "🔎": "search", "✂": "scissors", "📭": "mailbox", "📬": "mailbox", "📫": "mailbox", "🪟": "window", "🛏": "bed",
  "🛋": "sofa", "🤝": "handshake", "💡": "bulb", "✏": "pencil", "📝": "pencil", "📈": "chartUp", "📊": "chartBars",
  "🎵": "music", "🎶": "music", "🎙": "mic", "🎤": "mic", "🎨": "palette", "👕": "shirt", "🔦": "flashlight", "🩹": "bandage",
  "❄": "snowflake", "🧊": "ice", "🚨": "siren", "💍": "ring", "🧠": "brain", "💪": "muscle",
  "🔧": "wrench", "🔨": "hammer", "🛠": "tools", "🕹": "joystick", "🔋": "powerCell", "🪫": "powerCell", "🎮": "gamepad", "👋": "wave",
  // food
  "🍔": "burger", "🍲": "stew", "🥤": "drink", "🍩": "donut", "🥫": "can", "🍎": "apple", "☕": "coffee", "🍰": "cake", "🍕": "pizza", "🌭": "hotdog",
  // faces & creatures
  "🙂": "smile", "😀": "smile", "😊": "smile", "🤩": "starstruck", "😟": "worried", "😫": "tired", "😩": "tired", "😴": "sleepy",
  "😱": "shock", "😎": "cool", "😈": "devil", "🕶": "sunglasses", "🤖": "robot", "👽": "alien", "🥷": "ninja", "🧛": "vampire",
  "🦊": "fox", "🐺": "wolf", "🐯": "tiger", "🦉": "owl", "🦅": "eagle", "🐉": "dragon", "🐲": "dragon", "🦂": "scorpion", "🦸": "hero", "🐾": "paw",
};

const VS = /️/g;
/** Art key for an emoji (with or without the variation selector), or undefined. */
export const artFor = (emoji: string): string | undefined => MAP[emoji.replace(VS, "")];

// Any pictographic emoji, with modifiers and ZWJ sequences (🏴‍☠️). Text-style symbols
// like → ✓ ✕ ★ stay typographic.
export const EMOJI_RE = /(?:\p{Extended_Pictographic}|[☀-➿])️?(?:‍(?:\p{Extended_Pictographic}|[☀-➿])️?)*/gu;
export const hasEmoji = (s: string) => {
  EMOJI_RE.lastIndex = 0;
  return EMOJI_RE.test(s);
};

/** Unmapped emoji that render as colour pictures (not text symbols like ✓ ✕ ★) get a sticker edge. */
export const SHOWN_AS_EMOJI = /\p{Emoji_Presentation}|\uFE0F/u;

/** Inline <svg> markup for one icon (the symbol itself lives in the shared sprite). */
export const artSvg = (key: string, alt: string) =>
  `<svg class="art art-${key}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#art-${key}"/></svg><span class="art-alt">${alt}</span>`;

/**
 * Swap the emoji in a piece of HTML (text only, never inside tags) for art.
 * `onKey` hears about each icon used, so the sprite can be filled in.
 */
export function artHtml(html: string, onKey?: (k: string) => void) {
  if (!hasEmoji(html)) return html;
  return html.replace(/(<[^>]*>)|([^<]+)/g, (m, tag: string | undefined, text: string | undefined) =>
    tag
      ? tag
      : text!.replace(EMOJI_RE, (em) => {
          const k = artFor(em);
          if (!k) return SHOWN_AS_EMOJI.test(em) ? `<span class="emo">${em}</span>` : em;
          onKey?.(k);
          return `<span class="art-w" data-art>${artSvg(k, em)}</span>`;
        }),
  );
}
