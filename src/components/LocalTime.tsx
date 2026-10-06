"use client";
import { useEffect, useState } from "react";

/** Renders a timestamp in the *viewer's* timezone (falls back to UTC on the server render). */
export function LocalTime({ iso, withZone = true }: { iso: string; withZone?: boolean }) {
  const fmt = (tz?: string) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz, timeZoneName: withZone ? "short" : undefined }).format(new Date(iso));
  const [text, setText] = useState(() => fmt("UTC"));
  useEffect(() => setText(fmt()), [iso]); // eslint-disable-line react-hooks/exhaustive-deps
  return <time dateTime={iso}>{text}</time>;
}
