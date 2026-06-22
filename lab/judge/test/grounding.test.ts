import { describe, it, expect } from "vitest";
import { checkGrounding } from "../src/grounding.js";
import type { Source } from "../src/types.js";

const sources: Source[] = [{ id: "1", text: "Gymshark increased conversion by 27% with Algolia.", label: "case" }];

describe("checkGrounding", () => {
  it("passes an answer whose claims are all in sources", async () => {
    const llm = async () => '{"violations":[]}';
    const r = await checkGrounding("Gymshark saw a 27% lift.", sources, llm);
    expect(r.grounded).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("trips on a contradicted/unsupported claim", async () => {
    const llm = async () => '{"violations":[{"claim":"Nike used Algolia","reason":"absent from sources"}]}';
    const r = await checkGrounding("Nike used Algolia for 50% growth.", sources, llm);
    expect(r.grounded).toBe(false);
    expect(r.violations[0].claim).toContain("Nike");
  });
});
