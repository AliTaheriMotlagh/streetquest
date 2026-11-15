// A small least-recently-used cache with an age limit (pure; tests/lru.test.ts). Every operation is
// O(1): a JS Map keeps insertion order, so "used" = delete + set moves a key to the newest end and the
// oldest is always the first key. Used in front of slower stores (the database's ExtCache, the
// product search's answers) so a repeated question is answered from memory.

export class Lru<V> {
  private m = new Map<string, { v: V; at: number }>();
  constructor(
    /** Entries kept at most; the least recently used goes first. */
    readonly max: number,
    /** An entry older than this (ms) is gone (Infinity: never). */
    readonly ttlMs = Infinity,
    private now: () => number = Date.now,
  ) {}

  get size() {
    return this.m.size;
  }

  /** The value and when it was stored, if it's here and not too old (and it becomes the newest). */
  entry(key: string): { v: V; at: number } | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (this.now() - e.at > this.ttlMs) {
      this.m.delete(key);
      return undefined;
    }
    this.m.delete(key);
    this.m.set(key, e);
    return e;
  }

  get(key: string): V | undefined {
    return this.entry(key)?.v;
  }

  /** Store `v` (as of `at`, default now), dropping the least recently used past `max`. */
  set(key: string, v: V, at = this.now()) {
    this.m.delete(key);
    this.m.set(key, { v, at });
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value!);
    return this;
  }

  delete(key: string) {
    return this.m.delete(key);
  }

  clear() {
    this.m.clear();
  }
}

/**
 * Concurrent callers asking the same key share one run of `load` (the second search for "pizza" a
 * moment after the first waits for the first instead of asking every site again).
 */
export function singleFlight<T>() {
  const running = new Map<string, Promise<T>>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const had = running.get(key);
    if (had) return had;
    const p = load().finally(() => running.delete(key));
    running.set(key, p);
    return p;
  };
}
