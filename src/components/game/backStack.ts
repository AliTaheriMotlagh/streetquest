"use client";
// The phone's back button (and the browser's Back) closes what's open on top — a card, a sheet,
// a product's page — one at a time, instead of leaving the game. While anything is open the
// game keeps one extra history entry; Back pops it, the top one closes (or steps back: a
// restaurant opened from the product list goes back to the list), and if something is still
// open underneath, the entry is put back. Closing with ✕ removes the entry again, so Back
// never has to be pressed twice. The entry copies the router's own state (Next.js keeps its
// tree there), so the router sees the same page and does nothing.
type Entry = { back: () => void };

const KEY = "__sqBack";
const stack: Entry[] = [];
let armed = false;
let skip = 0;
let seq = 0;
let listening = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function rearm() {
  if (!stack.length || armed) return;
  history.pushState({ ...(history.state ?? {}), [KEY]: ++seq }, "");
  armed = true;
}

/** After the stack changed: catch Back while something is open, give the entry back when nothing is. */
function settle() {
  if (timer) clearTimeout(timer);
  // Next tick: a card that replaces another (unmount + mount in one go) doesn't flap the history.
  timer = setTimeout(() => {
    timer = null;
    if (stack.length) return rearm();
    if (armed && history.state?.[KEY]) {
      armed = false;
      skip++;
      history.back();
    }
  }, 0);
}

function onPop() {
  if (skip > 0) {
    skip--;
    return;
  }
  if (!armed) return;
  armed = false;
  stack[stack.length - 1]?.back();
  settle();
}

/** Something that Back should close is open: `back` runs on Back. Returns the cleanup (call it when it closes). */
export function pushBack(back: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (!listening) {
    window.addEventListener("popstate", onPop);
    listening = true;
  }
  const e: Entry = { back };
  stack.push(e);
  settle();
  return () => {
    const i = stack.indexOf(e);
    if (i >= 0) stack.splice(i, 1);
    settle();
  };
}

/** How many things Back would close now (tests). */
export const backDepth = () => stack.length;
