"use client";
// useState that lives in the page address (codecs: lib/urlState.ts). Reads the value once on mount,
// writes changes back with history.replaceState (batched, no navigation, no re-render of the page), and
// takes its key out of the address again when the list closes.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { withParams, type Codec } from "@/lib/urlState";

const pending: Record<string, string | null> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function write(key: string, value: string | null) {
  pending[key] = value;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const set = { ...pending };
    for (const k of Object.keys(pending)) delete pending[k];
    const next = `${location.pathname}${withParams(location.search, set)}${location.hash}`;
    if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, "", next);
  }, 120);
}

export function useUrlParam<T>(key: string, def: T, codec: Codec<T>): [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => (typeof window === "undefined" ? def : (codec.parse(new URLSearchParams(location.search).get(key)) ?? def)));
  useEffect(() => write(key, codec.show(v)), [key, v]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => write(key, null), [key]);
  return [v, setV];
}
