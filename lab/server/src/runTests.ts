/**
 * runTests — run the locked v3 question set through the two neural panels (P3–P4)
 * and persist a transcript. No judging here; that's a separate step (judgeStep).
 *
 * Each (question × panel) goes through the unified answer producer (answer.ts):
 *   - single neural panel (P3) proxies ONE Agent Studio agent (Maverick, + generated follow-up)
 *   - multi neural panel (P4) runs the coded Maverick coordinator
 * The same contract is stored for every panel so the judge + leaderboard treat
 * them identically.
 *
 * Multi-turn (Cat 8) = GENERATED follow-up (the MULTI-TURN invariant). For Cat 8
 * openers we run turn 1 (capturing each panel's own generated follow-up), then a
 * turn 2 that re-runs WITH {turn1Answer, generatedFollowUp} in context. The
 * stored answer is the turn-2 answer; the turn-1 answer + the generated follow-up
 * are preserved so the judge can score `followUpQuality`.
 */
import { getEnv } from "./config.js";
import { parseQuestions, type TestQuestion } from "./questions.js";
import { buildPanels, type PanelAnswer, type PanelMeta } from "./panels.js";
import { makeAnswerDeps } from "./answerService.js";
import { producePanelAnswer, type AnswerDeps, type PanelAnswerResult } from "./answer.js";
import {
  newRunId,
  saveTranscript,
  type Transcript,
  type TranscriptPanel,
  type TranscriptQuestion,
} from "./store.js";
import { mapWithConcurrency } from "./concurrency.js";

const QUESTION_VERSION = "locked-v3";

/** Convert the unified answer result into the stored PanelAnswer shape. */
function toPanelAnswer(result: PanelAnswerResult): PanelAnswer {
  return {
    answer: result.answer,
    sources: result.sources.map((s, i) => ({
      id: `S${i + 1}`,
      text: s.title, // the judge grounds against the source text; title is the best the answer path carries
      ...(s.url ? { label: s.url } : s.title ? { label: s.title } : {}),
    })),
    source: result.sources[0]?.source ?? (result.error ? "error" : "agent"),
    ...(result.error ? { error: result.error } : {}),
  };
}

/**
 * Run one panel for one question. Cat 8 (multi-turn) → 2 turns with the panel's
 * own generated follow-up carried into turn 2; otherwise single turn.
 */
async function runPanelForQuestion(
  panel: PanelMeta,
  q: TestQuestion,
  deps: AnswerDeps,
): Promise<{ answer: PanelAnswer; followUp: string; trace?: unknown }> {
  // Cat 8 multi-turn: openers only — the follow-up is generated, not scripted.
  const isMultiTurn = q.category === 8;

  const turn1 = await producePanelAnswer(panel, q.prompt, { deps, turn: 1 });
  if (!isMultiTurn) {
    return {
      answer: toPanelAnswer(turn1),
      followUp: turn1.followUp,
      ...(turn1.trace ? { trace: turn1.trace } : {}),
    };
  }

  // Turn 2: re-run with the panel's OWN turn-1 answer + generated follow-up.
  const turn2 = await producePanelAnswer(panel, turn1.followUp || q.prompt, {
    deps,
    turn: 2,
    turn1Answer: turn1.answer,
    followUp: turn1.followUp,
  });
  return {
    answer: toPanelAnswer(turn2),
    // The judged followUpQuality signal scores the GENERATED follow-up (turn-1's).
    followUp: turn1.followUp,
    ...(turn2.trace ? { trace: turn2.trace } : {}),
  };
}

export interface RunTestsOptions {
  /** Limit to the first N questions (for quick verification dry runs). */
  limit?: number;
  /** Only these question ids (overrides limit). */
  onlyIds?: string[];
  /** Restrict to a split. */
  split?: "dev" | "held-out";
  /** Only run these panels (by id). Default: all four. */
  panelIds?: string[];
  /** Inject deps (tests / autocorrect). Default: real seams from env. */
  deps?: AnswerDeps;
}

export async function runTests(opts: RunTestsOptions = {}): Promise<string> {
  let questions = parseQuestions();

  if (opts.split) questions = questions.filter((q) => q.split === opts.split);
  if (opts.onlyIds?.length) {
    const want = new Set(opts.onlyIds);
    questions = questions.filter((q) => want.has(q.id));
  } else if (typeof opts.limit === "number") {
    questions = questions.slice(0, opts.limit);
  }

  let panels = buildPanels();
  if (opts.panelIds?.length) {
    const want = new Set(opts.panelIds);
    panels = panels.filter((p) => want.has(p.panelId));
    if (panels.length === 0) {
      throw new Error(`panelIds [${opts.panelIds.join(", ")}] matched no panels`);
    }
  }

  const deps = opts.deps ?? (await makeAnswerDeps());
  const concurrency = Math.max(1, Number(getEnv().RUN_CONCURRENCY ?? 4) || 4);

  const runId = newRunId();
  console.log(`\n[run-tests] runId=${runId}`);
  console.log(
    `[run-tests] ${questions.length} question(s) × ${panels.length} panel(s), concurrency=${concurrency}\n`,
  );

  const tasks = questions.flatMap((q, qi) =>
    panels.map((panel, pi) => ({ q, qi, panel, pi })),
  );

  const flat = await mapWithConcurrency(tasks, concurrency, async (t) => {
    const t0 = Date.now();
    const { answer, followUp, trace } = await runPanelForQuestion(t.panel, t.q, deps);
    const latencyMs = Date.now() - t0;
    const status = answer.error
      ? `ERROR ${answer.error.slice(0, 80)}`
      : `${answer.answer.length} chars, ${answer.sources.length} src`;
    console.log(`  Q ${t.q.id} ${t.panel.panelId.padEnd(4)} ${latencyMs}ms  ${status}`);
    const tPanel: TranscriptPanel = {
      panelId: t.panel.panelId,
      panelLabel: t.panel.label,
      arch: t.panel.arch,
      retrieval: t.panel.retrieval,
      ...(t.panel.agentId ? { agentId: t.panel.agentId } : {}),
      index: t.panel.indexName,
      answer,
      ...(followUp ? { followUp } : {}),
      ...(trace ? { trace } : {}),
      latencyMs,
    };
    return { qi: t.qi, pi: t.pi, tPanel };
  });

  const tQuestions: TranscriptQuestion[] = questions.map((q) => ({
    questionId: q.id,
    category: q.category,
    split: q.split,
    prompt: q.prompt,
    ...(q.followUp ? { followUp: q.followUp } : {}),
    isRefusalTest: q.isRefusalTest,
    panels: new Array<TranscriptPanel>(panels.length),
  }));
  for (const { qi, pi, tPanel } of flat) tQuestions[qi].panels[pi] = tPanel;

  const transcript: Transcript = {
    runId,
    createdAt: new Date().toISOString(),
    questionVersion: QUESTION_VERSION,
    panelOrder: panels.map((p) => p.panelId),
    questions: tQuestions,
  };

  const path = saveTranscript(transcript);
  console.log(`\n[run-tests] transcript saved → ${path}`);
  return runId;
}
