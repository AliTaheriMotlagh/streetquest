// Persian (فارسی) translations, keyed by the English text. Split by area so each file
// stays readable; `npm run i18n:check` finds anything missing or mismatched.
//
// Style guide — write it the way a Persian-speaking gamer would say it:
// • Conversational but correct (محاوره‌ی مؤدبانه، نه کتابی): «بزن بریم»، not «اقدام نمایید».
// • Use the half-space (ZWNJ, U+200C) inside words: «می‌شود»، «بازی‌ها»، «پایگاه‌ات».
// • Numbers come in as {placeholders} and are formatted with Persian digits automatically.
// • Persian nouns don't take a plural after numbers: «۳ بازیکن»، never «۳ بازیکن‌ها».
// • Game glossary: coins = سکه، gems = جم، XP = تجربه، HP = جان، level = سطح،
//   base = پایگاه، army = ارتش، squad = جوخه، crew = اکیپ، quest = مأموریت،
//   tower = برج، raid = یورش، siege = محاصره، breach = نفوذ، shop = مغازه، market = بازار،
//   showcase = ویترین، discount = تخفیف، order = سفارش.
import type { Messages } from "../index";
import common from "./common";
import game from "./game";
import market from "./market";
import help from "./help";
import data from "./data";
import server from "./server";
import panels from "./panels";
import play from "./play";
import hero from "./hero";
import base from "./base";
import lottery from "./lottery";
import minigames from "./minigames";
import location from "./location";
import call from "./call";
import fps from "./fps";
import app from "./app";
import landing from "./landing";
import pages from "./pages";

const fa: Messages = {
  ...common,
  ...game,
  ...market,
  ...help,
  ...data,
  ...server,
  ...panels,
  ...play,
  ...hero,
  ...base,
  ...lottery,
  ...minigames,
  ...location,
  ...call,
  ...fps,
  ...app,
  ...landing,
  ...pages,
};

export default fa;
