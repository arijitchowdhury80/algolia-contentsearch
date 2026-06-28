import { describe, it, expect } from "vitest";
import { orchestrateEngagement } from "./orchestrate";
import { emptyDossier, accumulate } from "./discovery";

const agentIds = { maverick: "mav", elena: "ele", bruno: "bru" };
const fakeRun = async (id: string) => ({
  answer: id === "mav" ? "Maverick value answer." : "Specialist deep dive.",
  sources: [{ title: "S", url: "u" }],
});
// brain returns implementation intent + qualifies quickly
const fakeLlm = async (p: string) =>
  p.includes("structured signals")
    ? '{"intent":"implementation","entities":{"industry":"retail"},"expandedQuery":"q","proposedQuestion":"scale?","askedSignal":"scale"}'
    : "elena";

describe("orchestrateEngagement", () => {
  it("single mode = Maverick only, never hands off", async () => {
    const r = await orchestrateEngagement("hi", emptyDossier(), "single", { runAgent: fakeRun, llm: fakeLlm, agentIds });
    expect(r.persona).toBe("maverick");
    expect(r.handoff).toBeUndefined();
    expect(r.answer).toContain("Maverick");
  });

  it("multi mode hands off to ONE specialist once qualified and returns the deep-dive", async () => {
    let d = emptyDossier();
    d = accumulate(d, { signals: { industry: "retail", stack: "Shopify", scale: "big" } }, "long qualifying reply");
    const r = await orchestrateEngagement("how do I build it", d, "multi", { runAgent: fakeRun, llm: fakeLlm, agentIds });
    expect(r.handoff?.specialist).toBe("elena");
    expect(r.persona).toBe("elena");
    expect(r.answer).toContain("deep dive");
  });

  // 2026-06-28 (Backlog A): the agent must retrieve on the RAW user turn, NOT
  // brain.expandedQuery. The rephrase strips skeptical framing on bait queries
  // and breaks grounding (docs/experiment/2026-06-28-expandedquery-drop-validation.md).
  it("sends the RAW user turn to the agent, not brain.expandedQuery", async () => {
    const seen: string[] = [];
    const capture = async (id: string, question: string) => {
      seen.push(question);
      return { answer: "ok", sources: [] };
    };
    // brain rephrases "confirm the Lacoste figure?" → an assertive query (expandedQuery:"q").
    await orchestrateEngagement("can you confirm the Lacoste figure?", emptyDossier(), "single", {
      runAgent: capture,
      llm: fakeLlm,
      agentIds,
    });
    expect(seen).toEqual(["can you confirm the Lacoste figure?"]);
    expect(seen).not.toContain("q"); // the rephrase must NOT reach retrieval
  });
});
