// agentRunner.test.ts
import { describe, it, expect, vi } from "vitest";
import { makeAgentStudioRunner } from "./agentRunner.js";

function fakeStreamingFetch(chunks: string[]) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    body: {
      getReader() {
        const enc = new TextEncoder();
        let i = 0;
        return {
          read: async () =>
            i < chunks.length
              ? { done: false, value: enc.encode(chunks[i++]) }
              : { done: true, value: undefined },
        };
      },
    },
  })) as unknown as typeof fetch;
}

describe("makeAgentStudioRunner (streaming)", () => {
  it("calls onToken per text frame and returns the assembled answer", async () => {
    const fetchImpl = fakeStreamingFetch(['0:"Hello "\n', '0:"world"\n']);
    const run = makeAgentStudioRunner({ appId: "APP", apiKey: "KEY", fetchImpl });
    const tokens: string[] = [];
    const res = await run("agent-1", "hi", [], (t) => tokens.push(t));
    expect(tokens).toEqual(["Hello ", "world"]);
    expect(res.answer).toBe("Hello world");
    expect(res.error).toBeUndefined();
  });

  it("still works without an onToken callback", async () => {
    const fetchImpl = fakeStreamingFetch(['0:"ok"\n']);
    const run = makeAgentStudioRunner({ appId: "APP", apiKey: "KEY", fetchImpl });
    const res = await run("agent-1", "hi");
    expect(res.answer).toBe("ok");
  });
});
