/**
 * liveJudge — judge a SINGLE typed question's displayed answers, on demand, for
 * the web UI's Analysis panel. Unlike judgeStep (which scores a whole persisted
 * transcript), this judges the exact answers the browser already rendered: the
 * request carries the answer text + the sources the UI saw.
 *
 * Reuses the same engine as the batch harness (judgeArtifactMultiRound) so the
 * verdicts are consistent — only the entry point differs. Live judging is
 * INDICATIVE (thinner sources + fewer rounds for latency); the batch `cli judge`
 * on a full transcript remains the authoritative verdict.
 *
 * The scoring fn is INJECTED so the orchestration is unit-testable without a
 * network; webserver.ts binds the default (provider-resolved Gemini/OpenAI llm).
 */
import {
  judgeArtifactMultiRound,
  ALGOLIA_ANSWER_RUBRIC,
  DEFAULT_JUDGE_CONFIG,
  type Artifact,
  type LlmComplete,
  type MultiRoundResult,
  type Temperament,
} from "@lab/judge";

/** A source the UI captured for an answer (thinner than the batch full-text). */
export interface LiveSource {
  id?: string;
  title?: string;
  url?: string;
  /** Substantive body for the grounding check; falls back to title. */
  text?: string;
}

/** One panel's displayed answer to be judged. */
export interface LivePanelInput {
  panelId: string;
  label?: string;
  answer: string;
  sources: LiveSource[];
  /**
   * The panel's GENERATED follow-up question (the MULTI-TURN test). When present,
   * the judge scores its quality (`followUpQuality`) as a separate comparable
   * signal — NOT folded into the composite.
   */
  generatedFollowUp?: string;
}

export interface LiveJudgeRequest {
  question: string;
  /** Second turn of a two-way (Cat 8) exchange; enables the engagement dimension. */
  followUp?: string;
  /** Out-of-scope question where a clean refusal is the CORRECT answer. */
  isRefusalTest?: boolean;
  /** Rounds for the voted gate; defaults applied by the caller. */
  rounds?: number;
  panels: LivePanelInput[];
}

/** One scored rubric dimension, round+judge averaged, for the UI's per-dim bars. */
export interface VerdictDimension {
  id: string;
  label: string;
  /** Mean raw score on the rubric's 1–10 scale. */
  score: number;
}

/** A claim the (gating) Skeptic judge flagged as unsupported by the sources. */
export interface VerdictViolation {
  /** The unsupported claim, quoted/paraphrased from the answer. */
  claim: string;
  /** Why no provided source backs it. */
  reason: string;
  /** Skeptic's confidence 0–1 that it's a real violation. */
  confidence: number;
}

/** The 3-dimension composite breakdown (each 1–10), named for the UI/contract. */
export interface VerdictDims {
  grounding: number;
  confidence: number;
  breadthDepth: number;
}

export interface LiveJudgeVerdict {
  panelId: string;
  /** One per temperament: round-averaged composite (0–10) + that judge's round-0 note. */
  judges: { role: Temperament; score: number; note: string }[];
  /** Alias of `judges`, named `perJudge` to match the Phase 4 contract. */
  perJudge: { role: Temperament; score: number; note: string }[];
  /** The 3-dimension breakdown (grounding / confidence / breadth_depth), 1–10. */
  dimensions: VerdictDimension[];
  /** Named 3-dim breakdown for the cross-panel contract. */
  dims: VerdictDims;
  /** Claims the Skeptic flagged as unsupported — the "why" behind a gate trip. */
  violations: VerdictViolation[];
  /** Alias of `violations`, named `flaggedClaims` to match the Phase 4 contract. */
  flaggedClaims: VerdictViolation[];
  /** Final 0–10 after consensus + voted gate (aggregate.finalScore) = the composite. */
  synthesizedScore: number;
  /** The composite (alias of synthesizedScore) — gate × mean(3 dims). */
  composite: number;
  /** Stable pre-gate consensus (aggregate.meanPreGateScore). */
  preGateScore: number;
  gateTripped: boolean;
  borderline: boolean;
  /**
   * Quality of the panel's GENERATED follow-up question (0–10), scored ONLY when
   * a follow-up is present (the MULTI-TURN test). NOT folded into the composite.
   */
  followUpQuality?: number;
  /** Chief-synthesizer narrative. */
  rationale: string;
  /** Set if this panel could not be judged; other panels are unaffected. */
  error?: string;
}

/**
 * Cross-panel deltas — the three numbers that ARE the 2×2 argument:
 *   multiLift  = multi − single, within a retrieval row (P2−P1 keyword, P4−P3 neural)
 *   neuralLift = neural − keyword, within an architecture column (P3−P1, P4−P2)
 *   compound   = P4 − P1 (best vs baseline)
 * Each is undefined when a needed panel was not judged in this request.
 */
export interface CrossPanelDeltas {
  multiLift?: { keyword?: number; neural?: number };
  neuralLift?: { single?: number; multi?: number };
  compound?: number;
}

export interface LiveJudgeResult {
  rounds: number;
  panels: LiveJudgeVerdict[];
  /** Present when ≥2 of the 2×2 panels (P1–P4) were judged together. */
  deltas?: CrossPanelDeltas;
}

/** Scores one artifact over N rounds. Injected for testing; default uses the LLM. */
export type ArtifactScorer = (
  artifact: Artifact,
  rounds: number,
) => Promise<MultiRoundResult>;

/**
 * Scores the QUALITY of a generated follow-up question (0–10) — the MULTI-TURN
 * head-to-head signal. Injected for testing; the default is LLM-backed
 * (`makeFollowUpScorer`). On-topic + logical + advances the conversation = high.
 */
export type FollowUpScorer = (
  question: string,
  answer: string,
  followUp: string,
) => Promise<number>;

const FOLLOWUP_JUDGE_SYSTEM = `You score the QUALITY of a single GENERATED follow-up question that an Algolia
answer assistant proposed after answering. You are NOT answering anything; you only rate the follow-up.

Score 0–10 on three things, then give ONE integer:
- ON-TOPIC: is it strictly about Algolia / the same domain as the original question? (off-topic = very low)
- LOGICAL: does it make sense given the original question and the answer given? (a non-sequitur = low)
- ADVANCES: does it move the conversation forward — clarifying an ambiguous opener, or deepening a clear one — rather than restating what was already covered?

A great follow-up is on-topic, logical, and genuinely advances the conversation → 9–10.
A weak/generic/off-topic/repetitive one → 0–4.

Return STRICT JSON only: { "score": <integer 0-10> }`;

/** Build the default LLM-backed follow-up-quality scorer. */
export function makeFollowUpScorer(llm: LlmComplete): FollowUpScorer {
  return async (question, answer, followUp): Promise<number> => {
    const out = await llm(
      `Original question: ${question}\nAnswer given (context): ${answer}\nGenerated follow-up to score: ${followUp}`,
      { system: FOLLOWUP_JUDGE_SYSTEM, temperature: 0, tag: "followup-quality" },
    );
    const start = out.indexOf("{");
    const end = out.lastIndexOf("}");
    if (start === -1 || end === -1) return 0;
    try {
      const j = JSON.parse(out.slice(start, end + 1)) as { score?: number };
      const s = Number(j.score);
      return Number.isFinite(s) ? Math.max(0, Math.min(10, s)) : 0;
    } catch {
      return 0;
    }
  };
}

/**
 * Compute the cross-panel deltas from a set of verdicts (keyed by panelId).
 * Only fills a delta when both needed panels are present + error-free. Pure.
 */
export function computeDeltas(verdicts: LiveJudgeVerdict[]): CrossPanelDeltas {
  const by = new Map(verdicts.filter((v) => !v.error).map((v) => [v.panelId, v.composite]));
  const sub = (a: string, b: string): number | undefined => {
    const x = by.get(a);
    const y = by.get(b);
    return x === undefined || y === undefined ? undefined : x - y;
  };
  const deltas: CrossPanelDeltas = {};
  const mlK = sub("P2", "P1"); // multi − single, keyword row
  const mlN = sub("P4", "P3"); // multi − single, neural row
  if (mlK !== undefined || mlN !== undefined) {
    deltas.multiLift = {
      ...(mlK !== undefined ? { keyword: mlK } : {}),
      ...(mlN !== undefined ? { neural: mlN } : {}),
    };
  }
  const nlS = sub("P3", "P1"); // neural − keyword, single column
  const nlM = sub("P4", "P2"); // neural − keyword, multi column
  if (nlS !== undefined || nlM !== undefined) {
    deltas.neuralLift = {
      ...(nlS !== undefined ? { single: nlS } : {}),
      ...(nlM !== undefined ? { multi: nlM } : {}),
    };
  }
  const compound = sub("P4", "P1"); // best vs baseline
  if (compound !== undefined) deltas.compound = compound;
  return deltas;
}

/**
 * Default number of live rounds. The live panel is INDICATIVE (the batch
 * `cli judge` is authoritative), so it runs a SINGLE round for latency — the
 * multi-round voted gate / zero-flicker guarantee matters for the authoritative
 * batch verdict, not the on-screen spinner.
 */
export const DEFAULT_LIVE_ROUNDS = 1;

/** Build a blind judge Artifact from one requested panel. Pure. */
export function buildLiveArtifact(
  req: LiveJudgeRequest,
  panel: LivePanelInput,
): Artifact {
  const prompt = req.followUp
    ? `${req.question}\n(follow-up) ${req.followUp}`
    : req.question;

  const sources = panel.sources.map((s, i) => ({
    id: s.id ?? `S${i + 1}`,
    text: s.text?.trim() || s.title?.trim() || "",
    ...(s.title ? { label: s.title } : s.url ? { label: s.url } : {}),
  }));

  // Engagement only applies to the two-way (multi-turn) questions.
  const notApplicableDimensions = req.followUp ? [] : ["engagement"];

  return {
    type: "algolia-answer",
    prompt,
    content: panel.answer,
    sources,
    notApplicableDimensions,
    ...(req.isRefusalTest ? { expectedBehavior: "refuse" as const } : {}),
  };
}

/** Each judge's round-averaged composite (0–10); note = its round-0 summary. */
function judgesFromRounds(
  result: MultiRoundResult,
): { role: Temperament; score: number; note: string }[] {
  const round0 = result.perRound[0]?.judgments ?? [];
  return result.aggregate.judgeComposites.map((c) => ({
    role: c.temperament,
    score: c.composite,
    note: round0.find((j) => j.temperament === c.temperament)?.summary ?? "",
  }));
}

/** Map the round-averaged dimension means to the UI's per-dimension shape, in rubric order. */
function dimensionsFromAggregate(
  result: MultiRoundResult,
): VerdictDimension[] {
  const means = result.aggregate.dimensionMeans;
  return ALGOLIA_ANSWER_RUBRIC.dimensions
    .filter((d) => means[d.id] !== undefined)
    .map((d) => ({ id: d.id, label: d.label, score: means[d.id] }));
}

/**
 * Collect the gating judge's (Skeptic's) flagged claims across rounds, deduped by
 * claim, highest-confidence first — so the UI can show WHY the grounding gate
 * tripped (or what it was borderline on), instead of an opaque "unsupported claim".
 */
function violationsFromRounds(result: MultiRoundResult): VerdictViolation[] {
  const seen = new Map<string, VerdictViolation>();
  for (const round of result.perRound) {
    for (const j of round.judgments) {
      if (j.temperament !== "skeptic") continue; // the designated gating judge
      for (const v of j.groundingViolations) {
        // Show only CONTRADICTED/fabricated flags — the ones that actually gate.
        // "unverifiable" (not-in-thin-sources) flags don't cap, so they'd make the
        // "N unsupported" count disagree with the score; exclude them here.
        if (v.kind === "unverifiable") continue;
        const key = v.claim.trim().toLowerCase().slice(0, 100);
        const prev = seen.get(key);
        if (!prev || v.confidence > prev.confidence) {
          seen.set(key, { claim: v.claim, reason: v.reason, confidence: v.confidence });
        }
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.confidence - a.confidence);
}

/** Pull the named 3-dim breakdown from the aggregate's dimensionMeans. Pure. */
function dimsFromAggregate(result: MultiRoundResult): VerdictDims {
  const m = result.aggregate.dimensionMeans;
  return {
    grounding: m.grounding ?? 0,
    confidence: m.confidence ?? 0,
    breadthDepth: m.breadth_depth ?? 0,
  };
}

/** Map a multi-round judge result to the UI verdict shape. Pure. */
export function toVerdict(
  panelId: string,
  result: MultiRoundResult,
): LiveJudgeVerdict {
  const agg = result.aggregate;
  const judges = judgesFromRounds(result);
  const violations = violationsFromRounds(result);
  return {
    panelId,
    judges,
    perJudge: judges,
    dimensions: dimensionsFromAggregate(result),
    dims: dimsFromAggregate(result),
    violations,
    flaggedClaims: violations,
    synthesizedScore: agg.finalScore,
    composite: agg.finalScore,
    preGateScore: agg.meanPreGateScore,
    gateTripped: agg.gateTripped,
    borderline: agg.borderline,
    rationale: result.perRound[0]?.synthesis.rationale ?? "",
  };
}

/**
 * Judge every requested panel's displayed answer. Panels are judged IN PARALLEL
 * (each is independent) for latency; a per-panel failure is isolated into that
 * verdict's `error` so one bad answer never fails the request. `onPanel` fires as
 * each panel's verdict resolves, enabling streamed progress to the UI. The
 * returned `panels` preserve the request order regardless of finish order.
 */
export interface JudgeLiveOptions {
  /** Fires as each panel's verdict resolves (streamed progress). */
  onPanel?: (verdict: LiveJudgeVerdict) => void;
  /**
   * Scores each panel's generated follow-up (the MULTI-TURN signal). When
   * omitted, `followUpQuality` is left unset even if a follow-up is present.
   */
  followUpScorer?: FollowUpScorer;
}

export async function judgeLive(
  req: LiveJudgeRequest,
  score: ArtifactScorer,
  onPanelOrOpts?: ((verdict: LiveJudgeVerdict) => void) | JudgeLiveOptions,
): Promise<LiveJudgeResult> {
  const opts: JudgeLiveOptions =
    typeof onPanelOrOpts === "function" ? { onPanel: onPanelOrOpts } : onPanelOrOpts ?? {};
  const rounds = Math.max(1, req.rounds ?? DEFAULT_LIVE_ROUNDS);

  const panels = await Promise.all(
    req.panels.map(async (panel): Promise<LiveJudgeVerdict> => {
      let verdict: LiveJudgeVerdict;
      try {
        const artifact = buildLiveArtifact(req, panel);
        const result = await score(artifact, rounds);
        verdict = toVerdict(panel.panelId, result);
        // followUpQuality — scored ONLY when the panel generated a follow-up and a
        // scorer is provided. A separate comparable signal, NOT in the composite.
        if (panel.generatedFollowUp && opts.followUpScorer) {
          verdict.followUpQuality = await opts.followUpScorer(
            req.question,
            panel.answer,
            panel.generatedFollowUp,
          );
        }
      } catch (e) {
        verdict = {
          panelId: panel.panelId,
          judges: [],
          perJudge: [],
          dimensions: [],
          dims: { grounding: 0, confidence: 0, breadthDepth: 0 },
          violations: [],
          flaggedClaims: [],
          synthesizedScore: 0,
          composite: 0,
          preGateScore: 0,
          gateTripped: false,
          borderline: false,
          rationale: "",
          error: (e as Error).message,
        };
      }
      opts.onPanel?.(verdict);
      return verdict;
    }),
  );

  const deltas = computeDeltas(panels);
  return {
    rounds,
    panels,
    ...(Object.keys(deltas).length > 0 ? { deltas } : {}),
  };
}

/** Bind the real judge engine to an LLM, producing a default ArtifactScorer. */
export function makeLlmScorer(llm: LlmComplete): ArtifactScorer {
  return (artifact, rounds) =>
    judgeArtifactMultiRound(artifact, DEFAULT_JUDGE_CONFIG, llm, rounds);
}
