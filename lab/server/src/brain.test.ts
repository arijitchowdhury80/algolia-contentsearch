import { describe, it, expect } from "vitest";
import { parseBrain, runBrain } from "./brain";
import { emptyDossier } from "./discovery";

describe("parseBrain", () => {
  it("parses a JSON brain output, tolerating prose wrapper", () => {
    const raw = 'Sure:\n{"intent":"discovery","entities":{"brand":"Gymshark","industry":"retail"},"expandedQuery":"gymshark retail search relevance","proposedQuestion":"What stack are you on?","askedSignal":"stack"}';
    const out = parseBrain(raw);
    expect(out.intent).toBe("discovery");
    expect(out.entities.brand).toBe("Gymshark");
    expect(out.expandedQuery).toContain("gymshark");
    expect(out.askedSignal).toBe("stack");
  });

  it("drops an askedSignal value that is not a valid OnionSignal", () => {
    const raw = '{"intent":"discovery","entities":{},"expandedQuery":"brand awareness","askedSignal":"brand"}';
    const out = parseBrain(raw);
    expect(out.askedSignal).toBeUndefined();
  });
});

describe("runBrain", () => {
  it("falls back to the raw user query on LLM failure (spec §8)", async () => {
    const llm = async () => { throw new Error("LLM down"); };
    const out = await runBrain("how do I do faceted search", emptyDossier(), llm);
    expect(out.expandedQuery).toBe("how do I do faceted search");
    expect(out.intent).toBe("unknown");
  });
});
