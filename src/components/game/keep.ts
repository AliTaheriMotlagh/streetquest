"use client";
// The phone's own copy of what it looked up (tickets, stays, product searches): shown at once the
// next time — offline too — and asked for again only when it has got old (`fresh`). Kept in
// localStorage, at most MAX entries (the oldest go first, and first when the storage is full).
// Private browsing or blocked storage: nothing is kept and everything still works.
const PREFIX = "sq-keep:";
const INDEX = "sq-keep-index";
const MAX = 40;

type Entry<T> = { at: number; data: T };

const readIndex = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const writeIndex = (keys: string[]) => {
  try {
    localStorage.setItem(INDEX, JSON.stringify(keys));
  } catch {}
};

/** The kept copy and when it was saved (null: none). */
export function kept<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

/** Is the kept copy younger than `ms`? (Then don't ask the network at all.) */
export const fresh = (e: { at: number } | null, ms: number) => !!e && Date.now() - e.at < ms;

/** Keep a copy (newest first in the index; the oldest beyond MAX, or when the storage is full, are dropped). */
export function keep<T>(key: string, data: T) {
  const value = JSON.stringify({ at: Date.now(), data } satisfies Entry<T>);
  let keys = [key, ...readIndex().filter((k) => k !== key)];
  for (const k of keys.slice(MAX)) drop(k);
  keys = keys.slice(0, MAX);
  for (let i = 0; i < 6; i++) {
    try {
      localStorage.setItem(PREFIX + key, value);
      writeIndex(keys);
      return;
    } catch {
      // Full: let the oldest go and try again.
      const old = keys.pop();
      if (!old || old === key) return;
      drop(old);
    }
  }
}

function drop(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}
