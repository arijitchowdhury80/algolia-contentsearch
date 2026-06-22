/**
 * Tests for webserver.ts — the /api/answer and /api/judge SSE endpoints.
 *
 * Focus: SSE streaming (delta events per token) and error handling.
 */
import { describe, it, expect } from "vitest";
import { runAnswerPanels, type AnswerDeps, type AnswerRequest } from "./answerService.js";
import type { AgentRunner } from "./agentRunner.js";

/** Default agentIds wired to recognisable ids so we can assert which ran. */
const agentIds = { maverick: "mav", elena: "ele", bruno: "bru" };

function deps(over: Partial<AnswerDeps> = {}): AnswerDeps {
  const runAgent: AgentRunner = async (agentId, _q, _h, onToken) => {
    // Simulate a streamed response by calling onToken per chunk.
    onToken?.("Hel");
    onToken?.("lo");
    return {
      answer: "Hello",
      sources: [{ title: "Doc", url: "https://x/doc" }],
    };
  };
  // brain returns stable JSON; baton returns "elena" (LLM fallback route).
  const llm = async (p: string) =>
    p.includes("structured signals") || p.includes("KNOWN SO FAR")
      ? '{"intent":"implementation","entities":{},"expandedQuery":"q","proposedQuestion":"next?","askedSignal":"stack"}'
      : "elena";
  return { runAgent, llm, agentIds, ...over };
}

describe("streaming /api/answer", () => {
  it("emits per-token deltas before the final panel payload", async () => {
    const events: Array<{ kind: string; token?: string; panelId?: string }> = [];
    const fakeDeps = deps();
    await runAnswerPanels(
      { question: "hi", panels: ["P3"] } as AnswerRequest,
      fakeDeps,
      (p) => events.push({ kind: "panel", panelId: p.panelId }),
      undefined,
      (panelId: string, token: string) => events.push({ kind: "delta", token, panelId }),
    );
    // Should have delta events for each token
    const deltas = events.filter((e) => e.kind === "delta");
    expect(deltas.length).toBeGreaterThan(0);
    const tokens = deltas.map((d) => d.token);
    expect(tokens).toContain("Hel");
    expect(tokens).toContain("lo");
    // Should also have at least one panel event
    expect(events.some((e) => e.kind === "panel")).toBe(true);
  });

  it("delta events include panelId", async () => {
    const deltas: Array<{ panelId: string; token: string }> = [];
    const fakeDeps = deps();
    await runAnswerPanels(
      { question: "hi", panels: ["P3"] } as AnswerRequest,
      fakeDeps,
      () => {},
      undefined,
      (panelId: string, token: string) => deltas.push({ panelId, token }),
    );
    // All deltas should have panelId set
    for (const d of deltas) {
      expect(d.panelId).toBe("P3");
    }
  });

  it("onToken is optional (backward-compatible)", async () => {
    const fakeDeps = deps();
    const panels = await runAnswerPanels(
      { question: "hi", panels: ["P3"] } as AnswerRequest,
      fakeDeps,
      (p) => expect(p.panelId).toBeDefined(),
      // No onToken callback
    );
    // Should still complete without error
    expect(panels.length).toBe(1);
    expect(panels[0].answer).toBe("Hello");
  });

  it("multiple panels emit deltas with correct panelIds", async () => {
    const deltas: Array<{ panelId: string; token: string }> = [];
    const fakeDeps = deps();
    await runAnswerPanels(
      { question: "hi", panels: ["P3", "P4"] } as AnswerRequest,
      fakeDeps,
      () => {},
      undefined,
      (panelId: string, token: string) => deltas.push({ panelId, token }),
    );
    // Should have deltas from both panels
    const p3Deltas = deltas.filter((d) => d.panelId === "P3");
    const p4Deltas = deltas.filter((d) => d.panelId === "P4");
    expect(p3Deltas.length).toBeGreaterThan(0);
    expect(p4Deltas.length).toBeGreaterThan(0);
    // All should have tokens
    for (const d of p3Deltas) {
      expect(d.token).toBeTruthy();
    }
    for (const d of p4Deltas) {
      expect(d.token).toBeTruthy();
    }
  });
});
