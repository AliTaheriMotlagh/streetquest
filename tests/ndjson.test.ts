// Streamed answers (lib/ndjson.ts): the hotel list fills in as each page answers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ndjsonLine, ndjsonStream, readNdjson, splitLines } from "@/lib/ndjson";

const later = <T,>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const fail = (ms: number) => new Promise<never>((_, r) => setTimeout(() => r(new Error("down")), ms));

/** A stream that hands over `text` in the given chunk sizes (a line split across network packets). */
function chunked(text: string, sizes: number[]): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let at = 0, k = 0;
  return new ReadableStream({
    pull(ctl) {
      if (at >= bytes.length) return ctl.close();
      const n = sizes[k++ % sizes.length];
      ctl.enqueue(bytes.slice(at, at + n));
      at += n;
    },
  });
}

describe("ndjson", () => {
  it("cuts whole lines and keeps the unfinished one", () => {
    assert.deepEqual(splitLines('{"a":1}\n{"b"'), { lines: ['{"a":1}'], rest: '{"b"' });
    assert.deepEqual(splitLines("no newline yet"), { lines: [], rest: "no newline yet" });
    assert.deepEqual(splitLines('{"a":1}\n\n{"b":2}\n'), { lines: ['{"a":1}', '{"b":2}'], rest: "" });
    assert.equal(ndjsonLine({ x: "سلام" }), '{"x":"سلام"}\n');
  });

  it("sends each part as it settles (fastest first), skips failures unless told, then the end line", async () => {
    const s = ndjsonStream([later({ p: "slow" }, 30), later({ p: "fast" }, 5), fail(10)], () => ({ done: true }), (_e, i) => (i === 2 ? { failed: i } : undefined));
    const got: unknown[] = [];
    await readNdjson(s, (v) => got.push(v));
    assert.deepEqual(got, [{ p: "fast" }, { failed: 2 }, { p: "slow" }, { done: true }]);
  });

  it("reads lines split across chunks, multi-byte text included, and a last line without a newline", async () => {
    const text = `${ndjsonLine({ name: "هتل آزادی" })}${ndjsonLine({ n: 2 })}{"last":true}`;
    for (const sizes of [[1], [3, 7], [1000]]) {
      const got: unknown[] = [];
      await readNdjson(chunked(text, sizes), (v) => got.push(v));
      assert.deepEqual(got, [{ name: "هتل آزادی" }, { n: 2 }, { last: true }], `chunks ${sizes}`);
    }
  });
});
