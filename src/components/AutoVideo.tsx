"use client";
// A video that reliably autoplays on phones: iOS needs the `muted` and `playsinline`
// *attributes* (React only sets the property), browsers won't play hidden videos,
// and Low Power Mode / data saver block autoplay entirely — then we show a ▶ button.
import { useEffect, useRef, useState } from "react";

type Props = { src: string; poster?: string; className?: string; loop?: boolean; sound?: boolean; label?: string; onEnded?: () => void };

export function AutoVideo({ src, poster, className, loop = true, sound = false, label, onEnded }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);

  const play = () => {
    const v = ref.current;
    if (!v) return;
    v.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
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
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !sound;
    if (sound) play(); // the tap that turned sound on also counts as permission to play
  }, [sound]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`autovideo ${className ?? ""}`}>
      <video ref={ref} src={src} poster={poster} autoPlay muted playsInline loop={loop} preload="auto" aria-label={label} onEnded={onEnded} onPlaying={() => setBlocked(false)} />
      {blocked && (
        <button className="video-play" onClick={play} aria-label="Play video">
          ▶
        </button>
      )}
    </div>
  );
}
