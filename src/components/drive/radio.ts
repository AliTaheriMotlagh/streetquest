"use client";
// The car radio: plays the stations /api/radio lists (lib/radio.ts) straight from the station,
// in the car only — getting out pauses it, getting back in carries on. Volume follows the mixer's
// "Car radio" slider and the game's mute. (iOS ignores a media element's volume: there the slider
// can only silence it, at 0; a station's stream would need CORS for the game's audio graph.)
//
// Remixt Radio is no stream: each song is lanes (vocals, beat…) mixed in sync with every listener, so it plays in
// Remixt's own embed for games, in a frame made only while it's the station (removed on any other station, off or
// leaving the city — nothing polls or downloads in the background) and driven by postMessage. Its messages are
// read only from that frame and that origin. Where the browser won't let a frame start sound on its own (iOS
// Safari), the embed's card shows for one tap on its ▶, then hides again.
import { radioVolume, remixtEmbed, remixtState, stationAfter, type LiveStation } from "@/lib/radio";
import { t } from "@/lib/i18n";
import { getMix, isMuted, onMuteChange } from "../game/sfx";

export type RadioState = {
  station: LiveStation | null;
  /** tap: Remixt's card is showing, waiting for a tap on its ▶ (the browser blocked sound starting by itself). */
  status: "off" | "tuning" | "on" | "error" | "tap";
  /** What's on (Remixt tells it), the song after and how many are listening. */
  now?: { title: string; artist: string; next?: string; listeners?: number };
};

/** The station list, once per tab (the same for everyone; the server keeps the directory's answer six hours). */
let listing: { at: number; p: Promise<LiveStation[]> } | null = null;
const LIST_MS = 6 * 3600_000;
const stationList = () => {
  if (!listing || Date.now() - listing.at > LIST_MS)
    listing = {
      at: Date.now(),
      p: fetch("/api/radio")
        .then((r) => r.json())
        .then((j: { stations?: LiveStation[] }) => j.stations ?? [])
        .catch(() => ((listing = null), [])),
    };
  return listing.p;
};
/** Remixt hasn't said it's playing by now: its card asks for a tap. */
const TAP_AFTER_MS = 8000;

export class CarRadio {
  private el: HTMLAudioElement | null = null;
  private list: LiveStation[] = [];
  private loading: Promise<void> | null = null;
  private current: string | null = null;
  private inCar = true;
  private unsub: () => void;
  // Remixt: its frame, the card around it, where its messages may come from, and the "tap" timer.
  private dock: HTMLDivElement | null = null;
  private frame: HTMLIFrameElement | null = null;
  private frameOrigin = "";
  private tapTimer = 0;
  state: RadioState = { station: null, status: "off" };

  constructor(private onChange: (s: RadioState) => void) {
    this.unsub = onMuteChange(() => this.level());
    window.addEventListener("message", this.onMessage);
    void this.load(); // ready before the first press: iOS wants play() inside the tap itself
  }

  private load() {
    return (this.loading ??= stationList().then((l) => {
      this.list = l;
      if (!l.length) this.loading = null;
    }));
  }

  private set(status: RadioState["status"], now?: RadioState["now"]) {
    this.state = { station: this.list.find((s) => s.id === this.current) ?? null, status, ...(now ? { now } : {}) };
    this.onChange(this.state);
  }

  private level() {
    const v = radioVolume(getMix(), isMuted());
    if (this.el) {
      this.el.volume = v;
      this.el.muted = v <= 0;
    }
    this.post("volume", v);
  }

  /** The radio button (or N): the next station, and after the last one, off. */
  next() {
    if (!this.list.length) return void this.load().then(() => this.list.length && this.tune(stationAfter(null, this.list)));
    this.tune(stationAfter(this.current, this.list));
  }

  /** The stations there are (loaded in the background on start). */
  stations(): LiveStation[] {
    return this.list;
  }
  /** Straight to a station (the list), or off (null). */
  pick(id: string | null) {
    if (!this.list.length && id) return void this.load().then(() => this.tune(id));
    this.tune(id);
  }

  private tune(id: string | null) {
    this.current = id;
    const st = this.list.find((s) => s.id === id);
    if (!st?.embed) this.closeFrame();
    if (!st) {
      this.el?.pause();
      this.el?.removeAttribute("src");
      return this.set("off");
    }
    if (st.embed) {
      this.el?.pause();
      this.el?.removeAttribute("src");
      return this.openFrame(st);
    }
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "none";
      this.el.addEventListener("playing", () => this.current && !this.isEmbed() && this.set("on"));
      this.el.addEventListener("error", () => this.current && !this.isEmbed() && this.set("error"));
    }
    this.el.src = st.url;
    this.level();
    this.set("tuning");
    if (this.inCar) void this.el.play().catch(() => this.current === id && this.set("error"));
  }

  private isEmbed() {
    return !!this.list.find((s) => s.id === this.current)?.embed;
  }

  // ---------------------------------------------------------------- Remixt's frame
  private openFrame(st: LiveStation) {
    const e = remixtEmbed(st.url.replace(/\/embed\?autoplay=1$/, ""));
    if (!e) return this.set("error");
    if (!this.frame) {
      this.frameOrigin = e.origin;
      const dock = document.createElement("div");
      dock.className = "remixt-dock";
      dock.setAttribute("role", "dialog");
      dock.setAttribute("aria-label", st.name);
      const head = document.createElement("div");
      head.className = "remixt-dock-head";
      const say = document.createElement("span");
      say.textContent = t("Tap ▶ to start Remixt Radio");
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "✕";
      x.setAttribute("aria-label", t("Turn the radio off"));
      x.onclick = () => this.pick(null);
      head.append(say, x);
      const f = document.createElement("iframe");
      f.title = st.name;
      f.allow = "autoplay; encrypted-media";
      f.referrerPolicy = "strict-origin-when-cross-origin";
      // Its own sound and clicks, nothing else: no top navigation, no popups but its "open on Remixt" link.
      f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
      f.addEventListener("load", () => {
        this.level();
        this.post(this.inCar ? "play" : "pause");
      });
      f.src = e.url;
      dock.append(head, f);
      document.body.append(dock);
      this.dock = dock;
      this.frame = f;
    } else this.post(this.inCar ? "play" : "pause");
    this.set("tuning");
    this.waitForSound();
  }

  /** Not playing a while after asking: the card asks for a tap (only in the car, where it should play). */
  private waitForSound() {
    clearTimeout(this.tapTimer);
    this.tapTimer = window.setTimeout(() => {
      if (!this.frame || !this.inCar || this.state.status === "on") return;
      this.dock?.classList.add("show");
      this.set("tap", this.state.now);
    }, TAP_AFTER_MS);
  }

  private onMessage = (e: MessageEvent) => {
    if (!this.frame || e.source !== this.frame.contentWindow || e.origin !== this.frameOrigin) return;
    const s = remixtState(e.data);
    if (!s) return;
    const now = s.title ? { title: s.title, artist: s.artist, next: s.next, listeners: s.listeners } : undefined;
    if (s.playing) {
      clearTimeout(this.tapTimer);
      this.dock?.classList.remove("show");
      this.set("on", now);
    } else if (this.state.status === "on" && this.inCar) {
      // It stopped by itself (a network drop): the embed tunes in again on its own; ask for a tap if it can't.
      this.set("tuning", now);
      this.waitForSound();
    } else this.set(this.state.status, now ?? this.state.now);
  };

  private post(action: "play" | "pause" | "volume", value?: number) {
    this.frame?.contentWindow?.postMessage({ type: "remixt-radio", action, ...(value != null ? { value } : {}) }, this.frameOrigin || "*");
  }

  private closeFrame() {
    clearTimeout(this.tapTimer);
    if (!this.frame) return;
    this.post("pause");
    this.frame.src = "about:blank"; // stop its polling and sound at once
    this.dock?.remove();
    this.dock = null;
    this.frame = null;
  }

  /** In the car it plays; on foot (or in a match) it waits. */
  setInCar(on: boolean) {
    if (on === this.inCar) return;
    this.inCar = on;
    if (!this.current) return;
    if (this.frame) {
      this.post(on ? "play" : "pause");
      if (on) this.waitForSound();
      else (clearTimeout(this.tapTimer), this.dock?.classList.remove("show"));
      return;
    }
    if (!this.el) return;
    if (on) void this.el.play().catch(() => {});
    else this.el.pause();
  }

  dispose() {
    this.unsub();
    window.removeEventListener("message", this.onMessage);
    this.closeFrame();
    this.el?.pause();
    this.el?.removeAttribute("src");
    this.el = null;
  }
}
