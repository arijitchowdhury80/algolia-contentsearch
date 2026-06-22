import { describe, it, expect } from "vitest";
import { judgeEngagementTurn } from "../src/judgeReference";
import type { ReferenceTurnArtifact } from "../src/referenceTypes";

const art: ReferenceTurnArtifact = {
  userInput: "retail wins?",
  candidateAnswer: "Gymshark saw a 27% lift. [proof](https://www.algolia.com/x) with NeuralSearch and real impact across the funnel for shoppers.",
  candidateSources: [{ id: "1", text: "Gymshark 27% lift with Algolia NeuralSearch." }],
  goldAnswer: "Gymshark saw a 27% lift; Lacoste improved too.",
  goldSources: [{ id: "g", text: "..." }],
  turnRole: "discovery",
};

describe("judgeEngagementTurn", () => {
  it("produces a %-of-floor verdict with grounding, voice, criteria, and gap tags", async () => {
    // route llm by tag-bearing prompt content
    const llm = async (p: string) => {
      if (p.includes("verify grounding") || p.includes("CONTRADICTED")) return '{"violations":[]}';
      if (p.startsWith("Is the following CLAIM")) return "no"; // missed Lacoste claim → retrieval-gap
      return '{"pctOfGold":80,"rationale":"ok","missedClaims":["Lacoste improved too"]}';
    };
    const v = await judgeEngagementTurn(art, "maverick", llm);
    expect(v.grounded).toBe(true);
    expect(v.gated).toBe(false);
    expect(v.pctOfFloor).toBeGreaterThan(0);
    expect(v.missedClaims.some((m) => m.gap === "retrieval-gap")).toBe(true);
    expect(v.criteria.map((c) => c.id)).toContain("coverage");
  });
});
