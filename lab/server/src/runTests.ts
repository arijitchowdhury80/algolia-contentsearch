/**
 * runTests — run the locked question set through every panel and persist a
 * transcript. No judging here; that's a separate step (judge.ts).
 *
 * Multi-turn (Cat 8) questions: we run turn 1, then the follow-up WITH turn-1
 * history, and store the follow-up answer as the panel answer (that's the
 * two-way exchange we judge). Turn-1 answer is preserved in the history we keep.
 */
import { loadConfig, type ExperimentConfig, type PanelConfig } from "./config.js";
import { parseQuestions, type TestQuestion } from "./questions.js";
import {
  runAgentPanel,
  runWebsitePanel,
  type ConversationTurn,
  type PanelAnswer,
} from "./panels.js";
import {
  newRunId,
  saveTranscript,
  type Transcript,
  type TranscriptPanel,
  type TranscriptQuestion,
} from "./store.js";
import { mapWithConcurrency } from "./concurrency.js";

const QUESTION_VERSION = "locked-v2";

async function runPanelForQuestion(
  panel: PanelConfig,
  cfg: ExperimentConfig,
  q: TestQuestion,
): Promise<PanelAnswer> {
  const runOne = async (
    question: string,
    history: ConversationTurn[],
  ): Promise<PanelAnswer> => {
    if (panel.kind === "website") {
      return runWebsitePanel(question, history);
    }
    return runAgentPanel(
      panel.agentId!,
      cfg.ours.appId,
      cfg.ours.searchKey,
      question,
      history,
    );
  };

  // Single-turn.
  if (!q.followUp) return runOne(q.prompt, []);

  // Multi-turn: turn 1 → build history → follow-up. Judge the follow-up answer.
  const first = await runOne(q.prompt, []);
  const history: ConversationTurn[] = [
    { role: "user", content: q.prompt },
    { role: "assistant", content: first.answer },
  ];
  return runOne(q.followUp, history);
}

export interface RunTestsOptions {
  /** Limit to the first N questions (for quick verification dry runs). */
  limit?: number;
  /** Only these question ids (overrides limit). */
  onlyIds?: string[];
  /** Restrict to a split. */
  split?: "dev" | "held-out";
  /**
   * Only run these panels (by id). Default: all configured panels. Used by the
   * autocorrect loop to re-run ONLY the panel under optimization on later rounds
   * (the fixed ①/② floor is measured once and cached).
   */
  panelIds?: string[];
}

export async function runTests(opts: RunTestsOptions = {}): Promise<string> {
  const cfg = loadConfig();
  let questions = parseQuestions();

  if (opts.split) questions = questions.filter((q) => q.split === opts.split);
  if (opts.onlyIds?.length) {
    const want = new Set(opts.onlyIds);
    questions = questions.filter((q) => want.has(q.id));
  } else if (typeof opts.limit === "number") {
    questions = questions.slice(0, opts.limit);
  }

  let panels = cfg.panels;
  if (opts.panelIds?.length) {
    const want = new Set(opts.panelIds);
    panels = panels.filter((p) => want.has(p.id));
    if (panels.length === 0) {
      throw new Error(
        `panelIds [${opts.panelIds.join(", ")}] matched no configured panels`,
      );
    }
  }

  const runId = newRunId();
  console.log(`\n[run-tests] runId=${runId}`);
  console.log(
    `[run-tests] ${questions.length} question(s) × ${panels.length} panel(s), concurrency=${cfg.concurrency}\n`,
  );

  // Answer every (question × panel) pair in parallel (bounded). Each pair is
  // independent (multi-turn questions stay sequential WITHIN runPanelForQuestion),
  // so order is preserved by mapWithConcurrency and regrouped per question below.
  const tasks = questions.flatMap((q, qi) =>
    panels.map((panel, pi) => ({ q, qi, panel, pi })),
  );

  const flat = await mapWithConcurrency(tasks, cfg.concurrency, async (t) => {
    const t0 = Date.now();
    const answer = await runPanelForQuestion(t.panel, cfg, t.q);
    const latencyMs = Date.now() - t0;
    const status = answer.error
      ? `ERROR ${answer.error.slice(0, 80)}`
      : `${answer.answer.length} chars, ${answer.sources.length} src`;
    console.log(`  Q ${t.q.id} ${t.panel.id.padEnd(8)} ${latencyMs}ms  ${status}`);
    const tPanel: TranscriptPanel = {
      panelId: t.panel.id,
      panelLabel: t.panel.label,
      kind: t.panel.kind,
      ...(t.panel.agentId ? { agentId: t.panel.agentId } : {}),
      ...(t.panel.index ? { index: t.panel.index } : {}),
      answer,
      latencyMs,
    };
    return { qi: t.qi, pi: t.pi, tPanel };
  });

  // Regroup, preserving question + panel order.
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
    panelOrder: panels.map((p) => p.id),
    questions: tQuestions,
  };

  const path = saveTranscript(transcript);
  console.log(`\n[run-tests] transcript saved → ${path}`);
  return runId;
}
