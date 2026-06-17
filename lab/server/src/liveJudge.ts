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

export interface LiveJudgeVerdict {
  panelId: string;
  /** One per temperament: averaged weighted score + that judge's round-0 note. */
  judges: { role: Temperament; score: number; note: string }[];
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

/** Default number of live rounds — fewer than the batch default for latency. */
export const DEFAULT_LIVE_ROUNDS = 2;

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

/** Average each judge's weighted score across rounds; note = its round-0 summary. */
function judgesFromRounds(
  result: MultiRoundResult,
): { role: Temperament; score: number; note: string }[] {
  const sums = new Map<Temperament, { total: number; n: number }>();
  for (const round of result.perRound) {
    for (const j of round.judgments) {
      const cur = sums.get(j.temperament) ?? { total: 0, n: 0 };
      cur.total += j.weightedScore;
      cur.n += 1;
      sums.set(j.temperament, cur);
    }
  }
  const round0 = result.perRound[0]?.judgments ?? [];
  return [...sums.entries()].map(([role, { total, n }]) => ({
    role,
    score: n === 0 ? 0 : total / n,
    note: round0.find((j) => j.temperament === role)?.summary ?? "",
  }));
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
    synthesizedScore: agg.finalScore,
    preGateScore: agg.meanPreGateScore,
    gateTripped: agg.gateTripped,
    borderline: agg.borderline,
    rationale: result.perRound[0]?.synthesis.rationale ?? "",
  };
}

/**
 * Judge every requested panel's displayed answer. A per-panel judging failure is
 * isolated into that verdict's `error` so one bad answer never fails the request.
 */
export async function judgeLive(
  req: LiveJudgeRequest,
  score: ArtifactScorer,
): Promise<LiveJudgeResult> {
  const rounds = Math.max(1, req.rounds ?? DEFAULT_LIVE_ROUNDS);
  const panels: LiveJudgeVerdict[] = [];

  for (const panel of req.panels) {
    try {
      const artifact = buildLiveArtifact(req, panel);
      const result = await score(artifact, rounds);
      panels.push(toVerdict(panel.panelId, result));
    } catch (e) {
      panels.push({
        panelId: panel.panelId,
        judges: [],
        synthesizedScore: 0,
        preGateScore: 0,
        gateTripped: false,
        borderline: false,
        rationale: "",
        error: (e as Error).message,
      });
    }
  }

  return { rounds, panels };
}

/** Bind the real judge engine to an LLM, producing a default ArtifactScorer. */
export function makeLlmScorer(llm: LlmComplete): ArtifactScorer {
  return (artifact, rounds) =>
    judgeArtifactMultiRound(artifact, DEFAULT_JUDGE_CONFIG, llm, rounds);
}
