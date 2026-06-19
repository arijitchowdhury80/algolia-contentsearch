/**
 * Tests for answer.ts — the unified per-panel answer producer.
 *
 * P1/P3 (single) proxy ONE Agent Studio agent; P2/P4 (multi) run the coded
 * coordinator. Every panel returns the SAME contract. All seams (agent runner +
 * llm + orchestrator) are injected — no network.
 */
import { describe, it, expect } from "vitest";
import { producePanelAnswer, type AnswerDeps } from "./answer.js";
import type { PanelMeta } from "./panels.js";
import type { AgentRunner } from "./agentRunner.js";
import type { OrchestrationResult } from "./multiAgent.js";

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

function deps(over: Partial<AnswerDeps> = {}): AnswerDeps {
  const runAgent: AgentRunner = async (agentId) => ({
    answer: `single answer from ${agentId}`,
    sources: [{ id: "S1", text: "body", label: "https://x/doc" }],
  });
  const orchestrate = async (): Promise<OrchestrationResult> => ({
    answer: "merged multi answer",
    sources: [{ id: "S1", text: "body", label: "https://x/doc" }],
    followUp: "Want to go deeper on X?",
    trace: {
      entities: ["x"],
      intent: "how-to-config",
      ambiguous: false,
      specialists: [
        { name: "technical", fired: true, hits: 1 },
        { name: "marketer", fired: false, hits: 0 },
        { name: "academy", fired: false, hits: 0 },
        { name: "support", fired: false, hits: 0 },
      ],
      synthesisMs: 12,
    },
  });
  const llm = async (_p: string, opts?: { system?: string }) => {
    if (/follow-up per this exact rule/i.test(opts?.system ?? "")) return "A single follow-up?";
    return "x";
  };
  return {
    runAgent,
    orchestrate,
    llm,
    specialistAgents: {
      keyword: { technical: "t-k", marketer: "m-k", academy: "a-k", support: "s-k" },
      neural: { technical: "t-n", marketer: "m-n", academy: "a-n", support: "s-n" },
    },
    ...over,
  };
}

describe("producePanelAnswer — dispatch", () => {
  it("routes a single panel (P1) to the agent runner", async () => {
    let ranAgent = "";
    const d = deps({
      runAgent: async (agentId) => {
        ranAgent = agentId;
        return { answer: "single", sources: [{ id: "S1", text: "b" }] };
      },
    });
    const out = await producePanelAnswer(P1, "How does typo tolerance work?", { deps: d });
    expect(ranAgent).toBe("agent-p1");
    expect(out.answer).toBe("single");
  });

  it("routes a multi panel (P2) to the coordinator", async () => {
    let orchestrated = false;
    const d = deps({
      orchestrate: async () => {
        orchestrated = true;
        return {
          answer: "merged",
          sources: [],
          followUp: "next?",
          trace: { entities: [], intent: "", ambiguous: false, specialists: [], synthesisMs: 1 },
        };
      },
    });
    const out = await producePanelAnswer(P2, "q", { deps: d });
    expect(orchestrated).toBe(true);
    expect(out.answer).toBe("merged");
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
    expect(multi.trace).toBeDefined();
    expect(multi.trace?.specialists.length).toBe(4);
  });

  it("single panels generate a follow-up via the shared block", async () => {
    const d = deps();
    const out = await producePanelAnswer(P1, "q", { deps: d });
    expect(out.followUp).toBe("A single follow-up?");
  });

  it("neural single panel passes the natural-language query to the agent", async () => {
    let seen = "";
    const d = deps({
      runAgent: async (_a, question) => {
        seen = question;
        return { answer: "x", sources: [{ id: "S1", text: "b" }] };
      },
    });
    await producePanelAnswer(P3, "How do I add typo tolerance in Algolia?", { deps: d });
    expect(seen).toMatch(/how do i/i); // neural keeps the NL question
  });

  it("keyword single panel passes the de-padded bare-concept query to the agent", async () => {
    let seen = "";
    const d = deps({
      runAgent: async (_a, question) => {
        seen = question;
        return { answer: "x", sources: [{ id: "S1", text: "b" }] };
      },
    });
    await producePanelAnswer(P1, "How does Algolia handle typo tolerance?", { deps: d });
    expect(seen.toLowerCase()).not.toContain("algolia");
    expect(seen.toLowerCase()).toContain("typo tolerance");
  });

  it("turn 2 re-runs with the prior answer + follow-up in history", async () => {
    let historyLen = 0;
    const d = deps({
      runAgent: async (_a, _q, history) => {
        historyLen = history?.length ?? 0;
        return { answer: "turn2", sources: [{ id: "S1", text: "b" }] };
      },
    });
    const out = await producePanelAnswer(P1, "and personalization?", {
      deps: d,
      turn: 2,
      turn1Answer: "first answer",
      followUp: "what about personalization?",
    });
    expect(historyLen).toBeGreaterThanOrEqual(2); // user turn-1 + assistant turn-1
    expect(out.answer).toBe("turn2");
  });

  it("surfaces an agent error in the contract without throwing", async () => {
    const d = deps({
      runAgent: async () => ({ answer: "", sources: [], error: "agent 500" }),
    });
    const out = await producePanelAnswer(P1, "q", { deps: d });
    expect(out.error).toContain("agent 500");
  });
});
