import { describe, it, expect } from "vitest";
import { replayEngagement } from "./replay";
import type { GoldEngagement } from "./goldLoader";

const gold: GoldEngagement = {
  scenarioId: "retail-q1", vertical: "retail", tier: "Q1", expectsHandoff: false,
  drivingSequence: ["Tell me retail wins", "We use Shopify"],
  turns: [
    { turnIndex: 0, userInput: "Tell me retail wins", answer: "gold A0", sources: [], activePersona: "maverick" },
    { turnIndex: 1, userInput: "We use Shopify", answer: "gold A1", sources: [], activePersona: "maverick" },
  ],
  blessedBy: "arijit",
};

const deps = {
  runAgent: async (id: string) => ({ answer: `cand from ${id}`, sources: [] }),
  llm: async () => '{"intent":"discovery","entities":{},"expandedQuery":"q"}',
  agentIds: { maverick: "mav", elena: "ele", bruno: "bru" },
};

describe("replayEngagement", () => {
  it("aligns candidate turns 1:1 with the fixed driving sequence", async () => {
    const r = await replayEngagement(gold, "single", deps);
    expect(r.turns).toHaveLength(2);
    expect(r.turns[0].userInput).toBe("Tell me retail wins");
    expect(r.turns[1].gold.answer).toBe("gold A1");
    expect(r.turns[0].candidate.answer).toContain("cand from mav");
  });
});
