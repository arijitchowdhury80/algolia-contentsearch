/**
 * Tests for liveJudge — the single-question, judge-the-displayed-answers path
 * behind POST /api/judge. Pure mappers are tested directly; the orchestrator is
 * tested with an injected fake scorer (no network).
 */
import { describe, it, expect } from "vitest";
import type {
  MultiRoundResult,
  JudgePanelResult,
  Judgment,
  Temperament,
} from "@lab/judge";
import {
  buildLiveArtifact,
  toVerdict,
  judgeLive,
  type LiveJudgeRequest,
} from "./liveJudge.js";

// --- fixtures --------------------------------------------------------------

function judgment(temperament: Temperament, weighted: number, summary: string): Judgment {
  return {
    judgeId: temperament,
    temperament,
    dimensionScores: [{ dimensionId: "groundedness", score: weighted, rationale: "r" }],
    groundingViolations: [],
    summary,
    weightedScore: weighted,
  };
}

function panelRound(round: number, weighted: Record<Temperament, number>): JudgePanelResult {
  return {
    artifactType: "algolia-answer",
    round,
    judgments: [
      judgment("skeptic", weighted.skeptic, `skeptic r${round}`),
      judgment("referee", weighted.referee, `referee r${round}`),
      judgment("advocate", weighted.advocate, `advocate r${round}`),
    ],
    synthesis: {
      finalScore: 0,
      preGateScore: 0,
      gate: { tripped: false, cap: 3, triggeringViolations: [], explanation: "" },
      panelSpread: 0,
      rationale: round === 0 ? "synth narrative" : "",
    },
  };
}

function multiRound(opts?: {
  finalScore?: number;
  meanPreGate?: number;
  gateTripped?: boolean;
  borderline?: boolean;
}): MultiRoundResult {
  return {
    artifactType: "algolia-answer",
    perRound: [
      panelRound(0, { skeptic: 6, referee: 8, advocate: 9 }),
      panelRound(1, { skeptic: 7, referee: 8, advocate: 9 }),
    ],
    stats: {
      rounds: 2,
      finalScores: [6, 7],
      meanFinalScore: 6.5,
      stdDevFinalScore: 0.5,
      range: 1,
      anyGateTripped: opts?.gateTripped ?? false,
    },
    aggregate: {
      rounds: 2,
      perRoundPreGate: [6, 7],
      meanPreGateScore: opts?.meanPreGate ?? 6.4,
      stdDevPreGateScore: 0.2,
      gateTripFraction: opts?.gateTripped ? 1 : 0,
      gateTripped: opts?.gateTripped ?? false,
      borderline: opts?.borderline ?? false,
      finalScore: opts?.finalScore ?? 5.9,
      dimensionMeans: { grounding: 6.5, confidence: 7, breadth_depth: 8 },
      judgeComposites: [
        { judgeId: "skeptic", temperament: "skeptic", composite: 6.5 },
        { judgeId: "referee", temperament: "referee", composite: 8 },
        { judgeId: "advocate", temperament: "advocate", composite: 9 },
      ],
    },
  };
}

const baseReq: LiveJudgeRequest = {
  question: "What are Algolia's ranking criteria?",
  panels: [
    {
      panelId: "tuned",
      label: "Our System",
      answer: "Algolia ranks by tie-breaking criteria…",
      sources: [{ id: "S1", title: "Ranking", url: "https://x", text: "ranking body" }],
    },
  ],
};

// --- buildLiveArtifact ------------------------------------------------------

describe("buildLiveArtifact", () => {
  it("maps a single-turn panel to a blind artifact with engagement N/A", () => {
    const a = buildLiveArtifact(baseReq, baseReq.panels[0]);
    expect(a.type).toBe("algolia-answer");
    expect(a.prompt).toBe(baseReq.question);
    expect(a.content).toBe(baseReq.panels[0].answer);
    expect(a.notApplicableDimensions).toContain("engagement");
    expect(a.expectedBehavior).toBeUndefined();
    expect(a.sources[0]).toMatchObject({ id: "S1", text: "ranking body" });
  });

  it("honors the refusal flag and combines a follow-up into the prompt", () => {
    const req: LiveJudgeRequest = {
      ...baseReq,
      followUp: "and personalization?",
      isRefusalTest: true,
    };
    const a = buildLiveArtifact(req, req.panels[0]);
    expect(a.expectedBehavior).toBe("refuse");
    expect(a.prompt).toContain(req.question);
    expect(a.prompt).toContain("and personalization?");
    expect(a.notApplicableDimensions ?? []).not.toContain("engagement");
  });

  it("falls back to title when a source has no text body", () => {
    const req: LiveJudgeRequest = {
      ...baseReq,
      panels: [{ ...baseReq.panels[0], sources: [{ id: "S1", title: "OnlyTitle", url: "u" }] }],
    };
    const a = buildLiveArtifact(req, req.panels[0]);
    expect(a.sources[0].text).toBe("OnlyTitle");
  });
});

// --- toVerdict --------------------------------------------------------------

describe("toVerdict", () => {
  it("produces one entry per temperament with round-averaged composite + round-0 note", () => {
    const v = toVerdict("tuned", multiRound());
    expect(v.panelId).toBe("tuned");
    expect(v.judges.map((j) => j.role).sort()).toEqual(["advocate", "referee", "skeptic"]);
    const skeptic = v.judges.find((j) => j.role === "skeptic")!;
    expect(skeptic.score).toBeCloseTo(6.5); // aggregate.judgeComposites skeptic
    expect(skeptic.note).toBe("skeptic r0");
  });

  it("surfaces the 3-dimension breakdown in rubric order", () => {
    const v = toVerdict("tuned", multiRound());
    expect(v.dimensions.map((d) => d.id)).toEqual([
      "grounding",
      "confidence",
      "breadth_depth",
    ]);
    expect(v.dimensions[0]).toMatchObject({ id: "grounding", label: "Grounding", score: 6.5 });
  });

  it("carries synthesized/pre-gate scores, gate state and narrative", () => {
    const v = toVerdict("tuned", multiRound({ finalScore: 3, meanPreGate: 6.4, gateTripped: true }));
    expect(v.synthesizedScore).toBe(3);
    expect(v.preGateScore).toBeCloseTo(6.4);
    expect(v.gateTripped).toBe(true);
    expect(v.rationale).toBe("synth narrative");
  });
});

// --- judgeLive --------------------------------------------------------------

describe("judgeLive", () => {
  it("judges every requested panel and echoes the round count", async () => {
    const req: LiveJudgeRequest = {
      question: "q",
      rounds: 2,
      panels: [
        { panelId: "mirror", answer: "a1", sources: [] },
        { panelId: "tuned", answer: "a2", sources: [] },
      ],
    };
    const seen: string[] = [];
    const res = await judgeLive(req, async (artifact, rounds) => {
      seen.push(artifact.content);
      expect(rounds).toBe(2);
      return multiRound();
    });
    expect(res.rounds).toBe(2);
    expect(res.panels.map((p) => p.panelId)).toEqual(["mirror", "tuned"]);
    expect(seen).toEqual(["a1", "a2"]);
  });

  it("isolates a per-panel failure into an error without crashing others", async () => {
    const req: LiveJudgeRequest = {
      question: "q",
      panels: [
        { panelId: "mirror", answer: "boom", sources: [] },
        { panelId: "tuned", answer: "ok", sources: [] },
      ],
    };
    const res = await judgeLive(req, async (artifact) => {
      if (artifact.content === "boom") throw new Error("judge exploded");
      return multiRound();
    });
    const mirror = res.panels.find((p) => p.panelId === "mirror")!;
    const tuned = res.panels.find((p) => p.panelId === "tuned")!;
    expect(mirror.error).toContain("judge exploded");
    expect(tuned.error).toBeUndefined();
    expect(tuned.judges).toHaveLength(3);
  });
});
