// Quiet mode: a browser driven by a test (Playwright, the lag test: navigator.webdriver) or opened
// with ?quiet=1 gets no first-run tour, no "how this works" hints and no prompts (notifications,
// walking or from home?) — screenshots and recordings show the game itself. A test of the guides
// themselves turns them back on with localStorage sq_guides=1.

type Env = { webdriver?: boolean; search?: string; guides?: string | null };

/** Pure: whether guides and prompts stay hidden for this browser. */
export function quietFor({ webdriver, search, guides }: Env): boolean {
  if (guides === "1") return false;
  return !!webdriver || /[?&]quiet=1(?:&|$)/.test(search ?? "");
}

let memo: boolean | null = null;
/** This browser: quiet? (Read once; false on the server.) */
export function isQuiet(): boolean {
  if (memo != null) return memo;
  if (typeof window === "undefined") return false;
  let guides: string | null = null;
  try {
    guides = localStorage.getItem("sq_guides");
  } catch {}
  memo = quietFor({ webdriver: navigator.webdriver, search: location.search, guides });
  if (memo) document.documentElement.classList.add("quiet");
  return memo;
}
