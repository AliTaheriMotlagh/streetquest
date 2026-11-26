// Newline-delimited JSON (pure; tests/ndjson.test.ts): an answer that comes in parts, each part a line,
// so a list fills in as each source answers instead of waiting for the slowest. The server side turns
// a set of promises into a stream in the order they settle; the client side cuts what has arrived so
// far into whole lines (a line can be split across network chunks) and parses each one.

export const NDJSON_TYPE = "application/x-ndjson";

/** One value as a line. */
export const ndjsonLine = (v: unknown) => `${JSON.stringify(v)}\n`;

/** Whole lines in `buf` and what's left of an unfinished one. Blank lines are skipped. */
export function splitLines(buf: string): { lines: string[]; rest: string } {
  const at = buf.lastIndexOf("\n");
  if (at < 0) return { lines: [], rest: buf };
  return { lines: buf.slice(0, at).split("\n").filter((l) => l.trim()), rest: buf.slice(at + 1) };
}

/**
 * A stream of NDJSON lines: each producer's value as it settles (a rejected one is passed to `onError`,
 * which may give a line to send instead), then `end()`'s value as the last line.
 */
export function ndjsonStream<T, E = never>(producers: Promise<T>[], end: () => unknown, onError?: (e: unknown, i: number) => E | undefined): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(ctl) {
      const send = (v: unknown) => ctl.enqueue(enc.encode(ndjsonLine(v)));
      await Promise.all(
        producers.map((p, i) =>
          p.then(send, (e) => {
            const v = onError?.(e, i);
            if (v !== undefined) send(v);
          }),
        ),
      );
      send(end());
      ctl.close();
    },
  });
}

/** Reads an NDJSON body line by line (each parsed value to `onLine`); resolves when it ends. */
export async function readNdjson<T>(body: ReadableStream<Uint8Array>, onLine: (v: T) => void): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    buf += done ? dec.decode() : dec.decode(value, { stream: true });
    const { lines, rest } = splitLines(done ? `${buf}\n` : buf);
    buf = rest;
    for (const l of lines) onLine(JSON.parse(l) as T);
    if (done) return;
  }
}
