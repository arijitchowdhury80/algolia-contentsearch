/**
 * Tests for the coded Maverick coordinator (multiAgent.ts).
 *
 * The pure logic — buildRetrievalQuery (keyword de-padding vs neural pass-through)
 * and routeSpecialists (entities/intent → specialist set) — is tested directly.
 * orchestrate() is tested with an injected fake llm + fake agent runner (no
 * network), asserting the entity-extract → route → parallel fan-out → synthesize
 * → follow-up flow and the emitted trace.
 */
import { describe, it, expect } from "vitest";
import {
  routeSpecialists,
  buildRetrievalQuery,
  orchestrate,
  type SpecialistAgentMap,
} from "./multiAgent.js";
import type { AgentRunner } from "./agentRunner.js";
import type { LlmComplete } from "@lab/judge";

// --- buildRetrievalQuery + routeSpecialists (the plan's exact unit tests) -----

describe("routeSpecialists", () => {
  it("routes an API/docs question to Technical", () => {
    const r = routeSpecialists({ entities: ["typoTolerance"], intent: "how-to-config" });
    expect(r).toContain("technical");
  });
  it("can fan out to multiple specialists", () => {
    const r = routeSpecialists({ entities: ["pricing", "records"], intent: "troubleshoot-billing" });
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildRetrievalQuery", () => {
  it("keyword path uses bare concept terms (no Algolia padding)", () => {
    const q = buildRetrievalQuery("How do I add typo tolerance in Algolia?", "keyword");
    expect(q.toLowerCase()).not.toContain("algolia");
    expect(q.toLowerCase()).toContain("typo tolerance");
  });
  it("neural path keeps the natural-language question", () => {
    const q = buildRetrievalQuery("How do I add typo tolerance in Algolia?", "neural");
    expect(q).toMatch(/how do i/i);
  });
});

// --- routeSpecialists: more coverage of the deterministic mapping -----------

describe("routeSpecialists (intent + entity mapping)", () => {
  it("routes a troubleshoot intent to support", () => {
    expect(routeSpecialists({ entities: ["error"], intent: "troubleshoot" })).toContain("support");
  });
  it("routes a learning intent to academy", () => {
    expect(routeSpecialists({ entities: ["course"], intent: "learn" })).toContain("academy");
  });
  it("routes value/positioning intent to marketer", () => {
    expect(routeSpecialists({ entities: ["use cases"], intent: "compare-use-cases" })).toContain(
      "marketer",
    );
  });
  it("always returns at least one specialist (defaults to technical)", () => {
    const r = routeSpecialists({ entities: [], intent: "" });
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r).toContain("technical");
  });
  it("never returns duplicates", () => {
    const r = routeSpecialists({ entities: ["a", "b"], intent: "how-to-config" });
    expect(new Set(r).size).toBe(r.length);
  });
});

// --- buildRetrievalQuery: keyword de-padding edge cases ---------------------

describe("buildRetrievalQuery (keyword de-padding)", () => {
  it("strips framing words and keeps the concept", () => {
    const q = buildRetrievalQuery("What is vector search?", "keyword");
    expect(q.toLowerCase()).toContain("vector search");
    expect(q.toLowerCase()).not.toMatch(/\bwhat\b|\bis\b/);
  });
  it("does not produce an empty query for an all-stopword question", () => {
    const q = buildRetrievalQuery("How does it work?", "keyword");
    expect(q.trim().length).toBeGreaterThan(0);
  });
});

// --- orchestrate (fakes) ----------------------------------------------------

/** A scripted llm: returns canned text per phase, detected by the system prompt. */
function fakeLlm(): LlmComplete {
  return async (prompt, opts): Promise<string> => {
    const sys = opts?.system ?? "";
    const all = `${sys}\n${prompt}`;
    if (/routing brain/i.test(all)) {
      // EXTRACT phase → strict JSON
      return JSON.stringify({ entities: ["typo tolerance"], intent: "how-to-config", ambiguous: false });
    }
    if (/coordinator of a multi-agent/i.test(all)) {
      // SYNTHESIZE phase
      return "Algolia handles typo tolerance via the typoTolerance setting. [Typo Tolerance](https://x/typo)";
    }
    if (/follow-up per this exact rule/i.test(all)) {
      // FOLLOW-UP phase
      return "Would you like to see how to tune the minWordSizefor1Typo threshold?";
    }
    return "{}";
  };
}

/** A fake agent runner: every specialist returns one grounded hit. */
function fakeRunner(): AgentRunner {
  return async (agentId: string): Promise<{ answer: string; sources: { id: string; text: string; label?: string }[] }> => ({
    answer: `answer from ${agentId}`,
    sources: [{ id: "S1", text: "typo tolerance body", label: "https://x/typo" }],
  });
}

const specialistAgents: SpecialistAgentMap = {
  technical: "agent-tech",
  marketer: "agent-mkt",
  academy: "agent-aca",
  support: "agent-sup",
};

describe("orchestrate", () => {
  it("extracts → routes → fans out → synthesizes → follows up, with a trace", async () => {
    const out = await orchestrate("How do I add typo tolerance in Algolia?", {
      mode: "neural",
      specialistAgents,
      llm: fakeLlm(),
      runAgent: fakeRunner(),
    });
    expect(out.answer).toContain("typo tolerance");
    expect(out.sources.length).toBeGreaterThan(0);
    expect(out.followUp).toMatch(/\?$/); // a single follow-up question
    expect(out.trace.entities).toContain("typo tolerance");
    expect(out.trace.specialists.some((s) => s.name === "technical" && s.fired)).toBe(true);
    expect(typeof out.trace.synthesisMs).toBe("number");
  });

  it("only fires the routed specialists in parallel (not all four)", async () => {
    const fired: string[] = [];
    const runner: AgentRunner = async (agentId) => {
      fired.push(agentId);
      return { answer: "x", sources: [{ id: "S1", text: "t" }] };
    };
    await orchestrate("How do I configure typo tolerance?", {
      mode: "keyword",
      specialistAgents,
      llm: fakeLlm(),
      runAgent: runner,
    });
    // how-to-config routes to technical only (per routeSpecialists mapping).
    expect(fired).toEqual(["agent-tech"]);
  });

  it("passes the de-padded bare-concept query to specialists on the keyword path", async () => {
    let seenQuery = "";
    const runner: AgentRunner = async (_agentId, question) => {
      seenQuery = question;
      return { answer: "x", sources: [{ id: "S1", text: "t" }] };
    };
    await orchestrate("How does Algolia handle typo tolerance?", {
      mode: "keyword",
      specialistAgents,
      llm: fakeLlm(),
      runAgent: runner,
    });
    expect(seenQuery.toLowerCase()).not.toContain("algolia");
    expect(seenQuery.toLowerCase()).toContain("typo tolerance");
  });

  it("de-dupes sources cited by multiple specialists", async () => {
    const runner: AgentRunner = async () => ({
      answer: "x",
      sources: [{ id: "S1", text: "same", label: "https://dup" }],
    });
    // Force a multi-specialist route via an explicit multi-entity question.
    const llm: LlmComplete = async (prompt, opts) => {
      const all = `${opts?.system ?? ""}\n${prompt}`;
      if (/routing brain/i.test(all))
        return JSON.stringify({ entities: ["pricing", "error"], intent: "troubleshoot", ambiguous: false });
      if (/coordinator of a multi-agent/i.test(all)) return "merged [d](https://dup)";
      if (/follow-up per this exact rule/i.test(all)) return "Anything else?";
      return "{}";
    };
    const out = await orchestrate("pricing and errors?", {
      mode: "neural",
      specialistAgents,
      llm,
      runAgent: runner,
    });
    const dupCount = out.sources.filter((s) => s.label === "https://dup").length;
    expect(dupCount).toBe(1);
  });
});
