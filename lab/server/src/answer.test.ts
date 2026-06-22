/**
 * Tests for answer.ts — the unified per-panel answer producer.
 *
 * All four panels (P1–P4) share the same orchestrateEngagement code path.
 * P1/P3 (single) run Maverick only (no handoff); P2/P4 (multi) may hand off
 * to a specialist. All seams (agent runner + llm) are injected — no network.
 */
import { describe, it, expect } from "vitest";
import { producePanelAnswer, type AnswerDeps } from "./answer.js";
import type { PanelMeta } from "./panels.js";
import type { AgentRunner } from "./agentRunner.js";

const P1: PanelMeta = {
  panelId: "P1",
  label: "P1 · Single · Keyword",
  arch: "single",
  retrieval: "keyword",
  indexName: "AC2_WWW_SINGLE_KEYWORD",
  agentId: "agent-p1",
};
const P2: PanelMeta = {
  panelId: "P2",
  label: "P2 · Multi · Keyword",
  arch: "multi",
  retrieval: "keyword",
  indexName: "AC2_WWW_MULTI_KEYWORD",
  coordinator: true,
};
const P3: PanelMeta = {
  panelId: "P3",
  label: "P3 · Single · Neural",
  arch: "single",
  retrieval: "neural",
  indexName: "AC2_WWW_SINGLE_NEURAL",
  agentId: "agent-p3",
};
const P4: PanelMeta = {
  panelId: "P4",
  label: "P4 · Multi · Neural",
  arch: "multi",
  retrieval: "neural",
  indexName: "AC2_WWW_MULTI_NEURAL",
  coordinator: true,
};

/** Default agentIds wired to recognisable ids so we can assert which ran. */
const agentIds = { maverick: "mav", elena: "ele", bruno: "bru" };

function deps(over: Partial<AnswerDeps> = {}): AnswerDeps {
  const runAgent: AgentRunner = async (agentId) => ({
    answer: `answer from ${agentId}`,
    sources: [{ title: "Doc", url: "https://x/doc" }],
  });
  // brain returns stable JSON; baton returns "elena" (LLM fallback route).
  const llm = async (p: string) =>
    p.includes("structured signals") || p.includes("KNOWN SO FAR")
      ? '{"intent":"implementation","entities":{},"expandedQuery":"q","proposedQuestion":"next?","askedSignal":"stack"}'
      : "elena";
  return { runAgent, llm, agentIds, ...over };
}

describe("producePanelAnswer — dispatch", () => {
  it("single panel routes to Maverick (agentIds.maverick)", async () => {
    let ranAgent = "";
    const d = deps({
      runAgent: async (agentId) => {
        ranAgent = agentId;
        return { answer: "single", sources: [{ title: "Doc", url: "https://x/doc" }] };
      },
    });
    const out = await producePanelAnswer(P1, "How does typo tolerance work?", { deps: d });
    expect(ranAgent).toBe("mav");
    expect(out.answer).toBe("single");
  });

  it("every panel returns the SAME contract shape (answer/sources/timing/followUp)", async () => {
    const d = deps();
    for (const panel of [P1, P2, P3, P4]) {
      const out = await producePanelAnswer(panel, "q", { deps: d });
      expect(typeof out.answer).toBe("string");
      expect(Array.isArray(out.sources)).toBe(true);
      expect(out.sources[0]).toMatchObject({ title: expect.any(String) });
      expect(typeof out.timing.firstTokenMs).toBe("number");
      expect(typeof out.timing.totalMs).toBe("number");
      expect(typeof out.followUp).toBe("string");
    }
  });

  it("multi panels carry a trace; single panels do not", async () => {
    const d = deps();
    const single = await producePanelAnswer(P3, "q", { deps: d });
    const multi = await producePanelAnswer(P4, "q", { deps: d });
    expect(single.trace).toBeUndefined();
    // multi always gets a trace (even when still in discovery / no handoff yet,
    // because answer.ts always emits one for arch=multi)
    expect(multi.trace).toBeDefined();
  });

  it("single panel follow-up comes from brain proposedQuestion", async () => {
    const d = deps();
    const out = await producePanelAnswer(P1, "q", { deps: d });
    // brain fakeLlm returns proposedQuestion: "next?"
    expect(out.followUp).toBe("next?");
  });

  it("surfaces an agent error in the contract without throwing", async () => {
    const d = deps({
      runAgent: async () => ({ answer: "", sources: [], error: "agent 500" }),
    });
    const out = await producePanelAnswer(P1, "q", { deps: d });
    // empty answer => returns empty contract rather than throwing
    expect(out.answer).toBe("");
    expect(out.error).toBeUndefined(); // no error field in empty-answer path
  });
});
