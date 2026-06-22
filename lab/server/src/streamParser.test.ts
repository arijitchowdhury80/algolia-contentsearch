import { describe, it, expect } from "vitest";
import { makeStreamParser } from "./streamParser";

describe("makeStreamParser", () => {
  it("emits text tokens incrementally and reassembles the full answer", () => {
    const p = makeStreamParser();
    const a = p.push('0:"Hello "\n0:"world"');
    expect(a.tokens).toEqual(["Hello ", "world"]);
    const fin = p.end();
    expect(fin.answer).toBe("Hello world");
  });

  it("buffers a line split across chunk boundaries", () => {
    const p = makeStreamParser();
    const a = p.push('0:"Hel'); // incomplete line, no newline
    expect(a.tokens).toEqual([]);
    const b = p.push('lo"\n');  // completes it
    expect(b.tokens).toEqual(["Hello"]);
  });

  it("collects sources from a: frames and de-dupes by url", () => {
    const p = makeStreamParser();
    const frame = 'a:' + JSON.stringify({ result: { hits: [
      { title: "Doc", url: "https://a.com/x" },
      { title: "Doc dup", url: "https://a.com/x" },
    ] } }) + "\n";
    p.push(frame);
    expect(p.end().sources).toEqual([{ title: "Doc", url: "https://a.com/x" }]);
  });

  it("surfaces a 3: error frame", () => {
    const p = makeStreamParser();
    p.push('3:"rate limited"\n');
    expect(p.end().error).toBe("rate limited");
  });
});
