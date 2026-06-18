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

export interface LiveJudgeVerdict {
  panelId: string;
  /** One per temperament: round-averaged composite (0–10) + that judge's round-0 note. */
  judges: { role: Temperament; score: number; note: string }[];
  /** The 3-dimension breakdown (grounding / confidence / breadth_depth), 1–10. */
  dimensions: VerdictDimension[];
  /** Final 0–10 after consensus + voted gate (aggregate.finalScore). */
  synthesizedScore: number;
  /** Stable pre-gate consensus (aggregate.meanPreGateScore). */
  preGateScore: number;
  gateTripped: boolean;
  borderline: boolean;
  /** Chief-synthesizer narrative. */
  rationale: string;
  /** Set if this panel could not be judged; other panels are unaffected. */
  error?: string;
}

export interface LiveJudgeResult {
  rounds: number;
  panels: LiveJudgeVerdict[];
}

/** Scores one artifact over N rounds. Injected for testing; default uses the LLM. */
export type ArtifactScorer = (
  artifact: Artifact,
  rounds: number,
) => Promise<MultiRoundResult>;

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

/** Map a multi-round judge result to the UI verdict shape. Pure. */
export function toVerdict(
  panelId: string,
  result: MultiRoundResult,
): LiveJudgeVerdict {
  const agg = result.aggregate;
  return {
    panelId,
    judges: judgesFromRounds(result),
    dimensions: dimensionsFromAggregate(result),
    synthesizedScore: agg.finalScore,
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
export async function judgeLive(
  req: LiveJudgeRequest,
  score: ArtifactScorer,
  onPanel?: (verdict: LiveJudgeVerdict) => void,
): Promise<LiveJudgeResult> {
  const rounds = Math.max(1, req.rounds ?? DEFAULT_LIVE_ROUNDS);

  const panels = await Promise.all(
    req.panels.map(async (panel): Promise<LiveJudgeVerdict> => {
      let verdict: LiveJudgeVerdict;
      try {
        const artifact = buildLiveArtifact(req, panel);
        const result = await score(artifact, rounds);
        verdict = toVerdict(panel.panelId, result);
      } catch (e) {
        verdict = {
          panelId: panel.panelId,
          judges: [],
          dimensions: [],
          synthesizedScore: 0,
          preGateScore: 0,
          gateTripped: false,
          borderline: false,
          rationale: "",
          error: (e as Error).message,
        };
      }
      onPanel?.(verdict);
      return verdict;
    }),
  );

  return { rounds, panels };
}

/** Bind the real judge engine to an LLM, producing a default ArtifactScorer. */
export function makeLlmScorer(llm: LlmComplete): ArtifactScorer {
  return (artifact, rounds) =>
    judgeArtifactMultiRound(artifact, DEFAULT_JUDGE_CONFIG, llm, rounds);
}
