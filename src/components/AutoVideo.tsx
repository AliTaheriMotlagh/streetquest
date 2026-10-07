"use client";
// A video that reliably autoplays on phones: iOS needs the `muted` and `playsinline`
// *attributes* (React only sets the property), browsers won't play hidden videos,
// and Low Power Mode / data saver / in-app browsers can block autoplay — then a ▶
// button appears. Sound can only be switched on inside the tap itself on iOS
// (unmuting later makes Safari pause the video), so the sound button lives here.
import { useEffect, useRef, useState } from "react";

type Props = { src: string; poster?: string; className?: string; loop?: boolean; label?: string; soundButton?: boolean };

export function AutoVideo({ src, poster, className, loop = true, label, soundButton = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sound, setSound] = useState(false);

  const play = () => {
    const v = ref.current;
    if (!v) return;
    const p = v.play();
    if (p) p.then(() => setBlocked(false)).catch(() => setBlocked(true));
  };

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.muted = true;
    play();
    // Play when it scrolls into view, pause when it leaves (saves battery and data).
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : v.pause()), { threshold: 0.25 });
    io.observe(v);
    const onVis = () => document.visibilityState === "visible" && play();
    document.addEventListener("visibilitychange", onVis);
    // Some browsers never resolve play() while stalled: if nothing moved after a few seconds, offer the button.
    const t = setTimeout(() => v.paused && setBlocked(true), 3500);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      clearTimeout(t);
    };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // Everything here runs inside the tap, which is what iOS requires for sound.
  const tapPlay = () => {
    setFailed(false);
    const v = ref.current;
    if (v && v.error) v.load();
    play();
  };
  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    const on = !sound;
    v.muted = !on;
    if (on) v.removeAttribute("muted");
    else v.setAttribute("muted", "");
    setSound(on);
    play();
  };

  return (
    <div className={`autovideo ${className ?? ""}`}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        autoPlay
        muted
        playsInline
        loop={loop}
        preload="auto"
        aria-label={label}
        onPlaying={() => (setBlocked(false), setFailed(false))}
        onError={() => setFailed(true)}
      />
      {(blocked || failed) && (
        <button className="video-play" onClick={tapPlay} aria-label="Play video">
          ▶<span>{failed ? "Retry" : "Tap to play"}</span>
        </button>
      )}
      {soundButton && !blocked && !failed && (
        <button className="ad-sound" onClick={toggleSound} aria-label={sound ? "Mute" : "Sound on"}>
          {sound ? "🔊 Sound on" : "🔇 Tap for sound"}
        </button>
      )}
    </div>
  );
}
