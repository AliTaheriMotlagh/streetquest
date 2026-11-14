"use client";
// The car radio: plays the stations /api/radio lists (lib/radio.ts) straight from the station,
// in the car only — getting out pauses it, getting back in carries on. Volume follows the mixer's
// "Car radio" slider and the game's mute. (iOS ignores a media element's volume: there the slider
// can only silence it, at 0; a station's stream would need CORS for the game's audio graph.)
import { radioVolume, stationAfter, type LiveStation } from "@/lib/radio";
import { getMix, isMuted, onMuteChange } from "../game/sfx";

export type RadioState = { station: LiveStation | null; status: "off" | "tuning" | "on" | "error" };

export class CarRadio {
  private el: HTMLAudioElement | null = null;
  private list: LiveStation[] = [];
  private loading: Promise<void> | null = null;
  private current: string | null = null;
  private inCar = true;
  private unsub: () => void;
  state: RadioState = { station: null, status: "off" };

  constructor(private onChange: (s: RadioState) => void) {
    this.unsub = onMuteChange(() => this.level());
    void this.load(); // ready before the first press: iOS wants play() inside the tap itself
  }

  private load() {
    return (this.loading ??= fetch("/api/radio")
      .then((r) => r.json())
      .then((j: { stations?: LiveStation[] }) => void (this.list = j.stations ?? []))
      .catch(() => void (this.loading = null)));
  }

  private set(status: RadioState["status"]) {
    this.state = { station: this.list.find((s) => s.id === this.current) ?? null, status };
    this.onChange(this.state);
  }

  private level() {
    if (!this.el) return;
    const v = radioVolume(getMix(), isMuted());
    this.el.volume = v;
    this.el.muted = v <= 0;
  }

  /** The radio button (or N): the next station, and after the last one, off. */
  next() {
    if (!this.list.length) return void this.load().then(() => this.list.length && this.tune(stationAfter(null, this.list)));
    this.tune(stationAfter(this.current, this.list));
  }

  private tune(id: string | null) {
    this.current = id;
    const st = this.list.find((s) => s.id === id);
    if (!st) {
      this.el?.pause();
      this.el?.removeAttribute("src");
      return this.set("off");
    }
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "none";
      this.el.addEventListener("playing", () => this.current && this.set("on"));
      this.el.addEventListener("error", () => this.current && this.set("error"));
    }
    this.el.src = st.url;
    this.level();
    this.set("tuning");
    if (this.inCar) void this.el.play().catch(() => this.current === id && this.set("error"));
  }

  /** In the car it plays; on foot (or in a match) it waits. */
  setInCar(on: boolean) {
    if (on === this.inCar) return;
    this.inCar = on;
    if (!this.el || !this.current) return;
    if (on) void this.el.play().catch(() => {});
    else this.el.pause();
  }

  dispose() {
    this.unsub();
    this.el?.pause();
    this.el?.removeAttribute("src");
    this.el = null;
  }
}
