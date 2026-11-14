// Turkish (Türkçe) translations, keyed by the English text, split by area exactly like fa/.
// `npm run i18n:check` checks it like the Persian one.
//
// Style guide — the way a Turkish-speaking gamer would say it:
// • Friendly "sen" form, short and natural: «Hadi gidelim», not «İşleminizi gerçekleştiriniz».
// • Keep {placeholders} exactly; numbers are formatted for Turkish automatically (12.345).
// • Game glossary: toman = tümen, lira = lira, wallet = cüzdan, coins = jeton, gems = elmas,
//   XP = TP (tecrübe puanı), HP = can, level = seviye, crew = ekip, quest = görev,
//   shop = dükkân, market = pazar, discount = indirim, order = sipariş, party = parti (oyun grubu).
import type { Messages } from "../index";
import common from "./common";
import game from "./game";
import market from "./market";
import help from "./help";
import data from "./data";
import server from "./server";
import transit from "./transit";
import developer from "./developer";
import panels from "./panels";
import play from "./play";
import lottery from "./lottery";
import empire from "./empire";
import location from "./location";
import call from "./call";
import app from "./app";
import landing from "./landing";
import pages from "./pages";
import admin from "./admin";
import settings from "./settings";
import world from "./world";
import drive from "./drive";
import money from "./money";
import landmarks from "./landmarks";
import arena from "./arena";
import local from "./local";
import directory from "./directory";
import social from "./social";
import adminobjects from "./adminobjects";
import scenarios from "./scenarios";

const tr: Messages = {
  ...arena,
  ...adminobjects,
  ...common,
  ...game,
  ...market,
  ...help,
  ...data,
  ...server,
  ...panels,
  ...play,
  ...lottery,
  ...empire,
  ...location,
  ...call,
  ...app,
  ...landing,
  ...pages,
  ...admin,
  ...settings,
  ...world,
  ...drive,
  ...money,
  ...landmarks,
  ...local,
  ...transit,
  ...developer,
  ...directory,
  ...social,
  ...scenarios,
};

export default tr;
