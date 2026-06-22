// lab/judge/test/gapClassifier.test.ts
import { describe, it, expect } from "vitest";
import { classifyGaps } from "../src/gapClassifier";
import type { Source } from "../src/types";

const sources: Source[] = [{ id: "1", text: "Algolia NeuralSearch blends keyword and vector retrieval." }];

describe("classifyGaps", () => {
  it("labels a claim supported by sources but missing from the answer as generation-gap", async () => {
    const llm = async () => "yes"; // claim IS supported by the source set
    const out = await classifyGaps(["NeuralSearch blends keyword and vector"], sources, llm);
    expect(out[0].gap).toBe("generation-gap");
  });
  it("labels a claim absent from sources as retrieval-gap", async () => {
    const llm = async () => "no"; // not in the source set at all
    const out = await classifyGaps(["Algolia offers a Shopify plugin"], sources, llm);
    expect(out[0].gap).toBe("retrieval-gap");
  });
});
