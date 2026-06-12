/**
 * judgeStep — run the AI Judge panel over every answer in a transcript and
 * persist scores. Judges are BLIND: the Artifact carries only the question, the
 * answer text, and its grounding sources — never the panel id/label. (The judge
 * module additionally injects a blinding instruction in its prompt builder.)
 *
 * Per-answer artifact construction:
 *   - type "algolia-answer"; prompt = the (possibly multi-turn) question.
 *   - sources = the panel's grounding hits (empty for the website stub / refusals).
 *   - engagement dimension applies ONLY to multi-turn (Cat 8) answers; marked
 *     not-applicable otherwise so one-shot answers aren't penalised for it.
 */
import {
  DEFAULT_JUDGE_CONFIG,
  judgeArtifactMultiRound,
  type Artifact,
  type LlmComplete,
} from "@lab/judge";
import { loadConfig, getEnv } from "./config.js";
import { makeOpenAIComplete } from "./openai.js";
import { makeGeminiComplete } from "./gemini.js";
import { makeJudgeLlm } from "./judgeLlm.js";
import { resolveActiveProvider } from "./provider.js";
import {
  loadTranscript,
  saveScores,
  type PanelScore,
  type ScoredQuestion,
  type ScoreSet,
  type TranscriptPanel,
  type TranscriptQuestion,
} from "./store.js";

/** Build a blind artifact for one panel's answer. */
function toArtifact(q: TranscriptQuestion, panel: TranscriptPanel): Artifact {
  const prompt = q.followUp
    ? `${q.prompt}\n(follow-up) ${q.followUp}`
    : q.prompt;

  const sources = panel.answer.sources.map((s) => ({
    id: s.id,
    text: s.text,
    ...(s.label ? { label: s.label } : {}),
  }));

  // Engagement only matters for the two-way (multi-turn) questions.
  const notApplicableDimensions = q.followUp ? [] : ["engagement"];

  return {
    type: "algolia-answer",
    prompt,
    content: panel.answer.answer,
    sources,
    notApplicableDimensions,
    // Cat-7 out-of-scope questions: a correct refusal must score high; a
    // substantive answer is the grounding failure ("refusal wins decisively").
    ...(q.isRefusalTest ? { expectedBehavior: "refuse" as const } : {}),
  };
}

async function scorePanel(
  q: TranscriptQuestion,
  panel: TranscriptPanel,
  llm: LlmComplete,
  rounds: number,
): Promise<PanelScore> {
  // An empty answer (panel errored) can't be judged — record the error.
  if (panel.answer.error && !panel.answer.answer) {
    return {
      panelId: panel.panelId,
      finalScore: 0,
      preGateScore: 0,
      gateTripped: false,
      panelSpread: 0,
      rationale: "",
      rounds: 0,
      meanPreGateScore: 0,
      stdDevPreGateScore: 0,
      gateTripFraction: 0,
      borderline: false,
      judgeScores: [],
      error: `panel error: ${panel.answer.error}`,
    };
  }

  const artifact = toArtifact(q, panel);
  // Multi-round: average the stable pre-gate consensus + VOTE the gate across
  // rounds so a one-off stochastic skeptic flag can't swing the final score.
  // Isolate failures: a single panel that can't be judged (e.g. the model never
  // returns parseable JSON) is recorded as an error, never crashing the run.
  let result: Awaited<ReturnType<typeof judgeArtifactMultiRound>>;
  try {
    result = await judgeArtifactMultiRound(artifact, DEFAULT_JUDGE_CONFIG, llm, rounds);
  } catch (e) {
    return {
      panelId: panel.panelId,
      finalScore: 0,
      preGateScore: 0,
      gateTripped: false,
      panelSpread: 0,
      rationale: "",
      rounds: 0,
      meanPreGateScore: 0,
      stdDevPreGateScore: 0,
      gateTripFraction: 0,
      borderline: false,
      judgeScores: [],
      error: `judge error: ${(e as Error).message}`,
    };
  }
  const agg = result.aggregate;
  // Round 1 carries the authored multi-round rationale.
  const rationale = result.perRound[0]?.synthesis.rationale ?? "";

  return {
    panelId: panel.panelId,
    finalScore: agg.finalScore,
    preGateScore: agg.meanPreGateScore,
    gateTripped: agg.gateTripped,
    panelSpread: result.perRound[0]?.synthesis.panelSpread ?? 0,
    rationale,
    rounds: agg.rounds,
    meanPreGateScore: agg.meanPreGateScore,
    stdDevPreGateScore: agg.stdDevPreGateScore,
    gateTripFraction: agg.gateTripFraction,
    borderline: agg.borderline,
    // Average each judge's weighted score across rounds for transparency.
    judgeScores: averageJudgeScores(result),
  };
}

/** Mean of each judge's weighted score across all rounds. */
function averageJudgeScores(
  result: Awaited<ReturnType<typeof judgeArtifactMultiRound>>,
): { judgeId: string; weightedScore: number }[] {
  const sums = new Map<string, { total: number; n: number }>();
  for (const round of result.perRound) {
    for (const j of round.judgments) {
      const cur = sums.get(j.judgeId) ?? { total: 0, n: 0 };
      cur.total += j.weightedScore;
      cur.n += 1;
      sums.set(j.judgeId, cur);
    }
  }
  return [...sums.entries()].map(([judgeId, { total, n }]) => ({
    judgeId,
    weightedScore: n === 0 ? 0 : total / n,
  }));
}

export interface JudgeOptions {
  /** Limit to the first N questions of the transcript (verification runs). */
  limit?: number;
  /** Only score these question ids. */
  onlyIds?: string[];
}

export async function judgeRun(
  runId: string,
  opts: JudgeOptions = {},
): Promise<string> {
  const cfg = loadConfig();
  const transcript = loadTranscript(runId);

  // SINGLE source of truth for the provider: prefer OpenAI, fall back to Gemini
  // (consistent across the whole system — see provider.ts). Overrides the static
  // config default so the judge always matches whatever the agents run.
  const env = getEnv();
  const spec = await resolveActiveProvider(env);
  const apiKey = env[spec.keyVar] ?? "";
  const rawLlm =
    spec.provider === "gemini"
      ? makeGeminiComplete({ apiKey, model: spec.judgeModel })
      : makeOpenAIComplete({ apiKey, model: spec.judgeModel });
  // Normalise judge dimensionIds (model echoes labels, parser keys on ids).
  const llm = makeJudgeLlm(rawLlm, DEFAULT_JUDGE_CONFIG.rubric);

  let questions = transcript.questions;
  if (opts.onlyIds?.length) {
    const want = new Set(opts.onlyIds);
    questions = questions.filter((q) => want.has(q.questionId));
  } else if (typeof opts.limit === "number") {
    questions = questions.slice(0, opts.limit);
  }

  console.log(
    `\n[judge] runId=${runId} provider=${spec.provider} model=${spec.judgeModel} rounds=${cfg.judgeRounds}`,
  );
  console.log(
    `[judge] ${questions.length} question(s); judges are blind to panel identity\n`,
  );

  const scored: ScoredQuestion[] = [];

  for (const q of questions) {
    console.log(`  Q ${q.questionId} (cat ${q.category})`);
    const panelScores: PanelScore[] = [];

    // Panels scored sequentially to keep concurrent LLM load modest; each
    // judgeArtifact already fans the 3 judges out in parallel internally.
    for (const panel of q.panels) {
      const s = await scorePanel(q, panel, llm, cfg.judgeRounds);
      const tag = s.error
        ? `ERROR ${s.error.slice(0, 60)}`
        : `final=${s.finalScore.toFixed(2)} (pre=${s.meanPreGateScore.toFixed(2)}±${s.stdDevPreGateScore.toFixed(2)}` +
          `${s.gateTripped ? `, GATED ${(s.gateTripFraction * 100).toFixed(0)}%` : s.borderline ? `, ~borderline ${(s.gateTripFraction * 100).toFixed(0)}%` : ""})`;
      console.log(`    ${panel.panelId.padEnd(8)} ${tag}`);
      panelScores.push(s);
    }

    scored.push({
      questionId: q.questionId,
      category: q.category,
      split: q.split,
      panels: panelScores,
    });
  }

  const scoreSet: ScoreSet = {
    runId,
    createdAt: new Date().toISOString(),
    judgeModel: cfg.judgeModel,
    questions: scored,
  };

  const path = saveScores(scoreSet);
  console.log(`\n[judge] scores saved → ${path}`);
  return path;
}
