/**
 * answer — the UNIFIED per-panel answer producer + the /api/answer data path.
 *
 * Every panel — single (P1/P3, proxy ONE Agent Studio agent) and multi (P2/P4,
 * the coded Maverick coordinator) — returns the SAME contract so the browser
 * renders all four identically:
 *
 *   { answer, sources:[{title,url,source}], timing:{firstTokenMs,totalMs}, followUp, trace? }
 *
 * The browser cannot run server-side orchestration (P2/P4) and admin/agent keys
 * must stay server-side, so ALL four panels' answers come through the backend.
 * Single panels also generate their follow-up here via the SAME shared block the
 * coordinator uses — the only differentiator across panels is architecture +
 * retrieval, never the prompt (FAIRNESS INVARIANT).
 */
import type { LlmComplete } from "@lab/judge";
import type { AgentRunner } from "./agentRunner.js";
import {
  buildRetrievalQuery,
  orchestrate as defaultOrchestrate,
  FOLLOWUP_SYSTEM,
  type OrchestrateOptions,
  type OrchestrationResult,
  type OrchestrationTrace,
  type SpecialistAgentMap,
  type SpecialistName,
} from "./multiAgent.js";
import type { ConversationTurn, PanelMeta, Retrieval } from "./panels.js";

// ---------------------------------------------------------------------------
// The unified contract
// ---------------------------------------------------------------------------

/** One source as the browser + judge consume it. */
export interface AnswerSource {
  title: string;
  url: string;
  /** Content slice/provenance tag, e.g. "agent" or a specialist name. */
  source: string;
}

export interface PanelTiming {
  /** ms to the first answer token (best-effort; equals totalMs for non-streamed paths). */
  firstTokenMs: number;
  /** ms for the whole answer to complete. */
  totalMs: number;
}

export interface PanelAnswerResult {
  answer: string;
  sources: AnswerSource[];
  timing: PanelTiming;
  followUp: string;
  /** Multi panels only — the Maverick orchestration trace. */
  trace?: OrchestrationTrace;
  error?: string;
}

// ---------------------------------------------------------------------------
// Dependencies (all injectable so tests run without a network)
// ---------------------------------------------------------------------------

export interface AnswerDeps {
  /** Runs ONE Agent Studio agent (single panels + specialist fan-out). */
  readonly runAgent: AgentRunner;
  /** The coded Maverick coordinator (multi panels). Defaults to multiAgent.orchestrate. */
  readonly orchestrate?: (
    question: string,
    opts: OrchestrateOptions,
  ) => Promise<OrchestrationResult>;
  /** The pinned LLM (single-panel follow-up generation + coordinator calls). */
  readonly llm: LlmComplete;
  /** Specialist agent ids per retrieval mode (for the coordinator fan-out). */
  readonly specialistAgents: Record<Retrieval, SpecialistAgentMap>;
}

export interface ProduceOptions {
  readonly deps: AnswerDeps;
  /** Conversation turn (1 = opener, 2 = follow-up turn). Default 1. */
  readonly turn?: 1 | 2;
  /** Turn-2 only: the panel's own turn-1 answer (carried into history). */
  readonly turn1Answer?: string;
  /** Turn-2 only: the generated follow-up that became the turn-2 question. */
  readonly followUp?: string;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Convert internal PanelSource ({id,text,label}) → browser AnswerSource. */
function toAnswerSources(
  sources: { id: string; text: string; label?: string }[],
  provenance: string,
): AnswerSource[] {
  return sources.map((s) => ({
    title: s.label ?? s.text.slice(0, 80),
    url: s.label && /^https?:\/\//.test(s.label) ? s.label : "",
    source: provenance,
  }));
}

/** Build the prior-turn history for a follow-up (turn-2) run. */
function historyForTurn(opts: ProduceOptions, question: string): ConversationTurn[] {
  if (opts.turn !== 2 || !opts.turn1Answer) return [];
  // The turn-1 *question* is the follow-up the panel generated; the turn-2
  // `question` arg is that follow-up. Carry the turn-1 exchange as context.
  const turn1Question = opts.followUp ?? question;
  return [
    { role: "user", content: turn1Question },
    { role: "assistant", content: opts.turn1Answer },
  ];
}

/** Generate the single follow-up question via the SHARED block (fairness). */
async function generateFollowUp(
  question: string,
  answer: string,
  ambiguous: boolean,
  llm: LlmComplete,
): Promise<string> {
  return (
    await llm(
      `Original question: ${question}\nYour answer (for context): ${answer}\nOriginal request was ambiguous: ${ambiguous}`,
      { system: FOLLOWUP_SYSTEM, temperature: 0, tag: "single:followup" },
    )
  ).trim();
}

// ---------------------------------------------------------------------------
// producePanelAnswer
// ---------------------------------------------------------------------------

/**
 * Produce one panel's answer. P1/P3 proxy a single Agent Studio agent (then
 * generate a follow-up); P2/P4 run the coordinator (which already produced a
 * follow-up + trace). Returns the unified contract. Errors are surfaced in the
 * result, never thrown (one bad panel never fails the others).
 */
export async function producePanelAnswer(
  panel: PanelMeta,
  question: string,
  opts: ProduceOptions,
): Promise<PanelAnswerResult> {
  const { deps } = opts;
  const t0 = Date.now();

  if (panel.arch === "multi") {
    const orchestrate = deps.orchestrate ?? defaultOrchestrate;
    const result = await orchestrate(question, {
      mode: panel.retrieval,
      specialistAgents: deps.specialistAgents[panel.retrieval],
      llm: deps.llm,
      runAgent: deps.runAgent,
      ...(opts.turn === 2 ? { history: historyForTurn(opts, question) } : {}),
    });
    const totalMs = Date.now() - t0;
    return {
      answer: result.answer,
      sources: toAnswerSources(result.sources, "coordinator"),
      timing: { firstTokenMs: totalMs, totalMs },
      followUp: result.followUp,
      trace: result.trace,
    };
  }

  // Single panel: proxy ONE agent with the mode's query, then generate follow-up.
  const query = buildRetrievalQuery(question, panel.retrieval);
  const history = historyForTurn(opts, question);
  const run = await deps.runAgent(panel.agentId ?? "", query, history);
  const totalMs = Date.now() - t0;

  if (run.error && !run.answer) {
    return {
      answer: "",
      sources: [],
      timing: { firstTokenMs: totalMs, totalMs },
      followUp: "",
      error: run.error,
    };
  }

  const followUp = await generateFollowUp(question, run.answer, false, deps.llm);
  return {
    answer: run.answer,
    sources: toAnswerSources(run.sources, "agent"),
    timing: { firstTokenMs: totalMs, totalMs },
    followUp,
    ...(run.error ? { error: run.error } : {}),
  };
}

/** Re-export for callers that need to name the specialist set type. */
export type { SpecialistName };
