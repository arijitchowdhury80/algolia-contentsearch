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
import type { AgentRunner, StreamSource, OnToken } from "./agentRunner.js";
import type { OrchestrationTrace } from "./multiAgent.js";
import { orchestrateEngagement, type OrchestrateDeps } from "./orchestrate.js";
import { emptyDossier } from "./discovery.js";
import type { PersonaId } from "./charters.js";
import type { PanelMeta } from "./panels.js";

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
  /** Runs ONE Agent Studio agent (all panels proxy through this). */
  readonly runAgent: AgentRunner;
  /** The pinned LLM (brain, baton, follow-up — shared across all panels for fairness). */
  readonly llm: LlmComplete;
  /** Agent Studio agent ids by persona (maverick, elena, bruno). */
  readonly agentIds: Record<PersonaId, string>;
}

export interface ProduceOptions {
  readonly deps: AnswerDeps;
  /** Conversation turn (1 = opener, 2 = follow-up turn). Default 1. */
  readonly turn?: 1 | 2;
  /** Turn-2 only: the panel's own turn-1 answer (carried into history). */
  readonly turn1Answer?: string;
  /** Turn-2 only: the generated follow-up that became the turn-2 question. */
  readonly followUp?: string;
  /** Callback fired per text token as the agent streams its response. */
  readonly onToken?: OnToken;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Convert StreamSource ({title,url,source?}) → browser AnswerSource. */
function toAnswerSources(
  sources: StreamSource[],
  provenance: string,
): AnswerSource[] {
  return sources.map((s) => ({
    title: s.title,
    url: s.url,
    source: provenance,
  }));
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

  const orchDeps: OrchestrateDeps = {
    runAgent: deps.runAgent,
    llm: deps.llm,
    agentIds: deps.agentIds,
  };

  if (panel.arch === "multi") {
    const result = await orchestrateEngagement(question, emptyDossier(), "multi", orchDeps, opts.onToken);
    const totalMs = Date.now() - t0;
    // Emit a minimal trace so the UI can surface persona + handoff even before RC2 trace
    // typing is promoted to its own shape. specialists[] is empty (no fan-out in RC2-shape).
    const trace: OrchestrationTrace & { persona?: PersonaId; handoff?: typeof result.handoff } = {
      entities: [],
      intent: "",
      ambiguous: false,
      specialists: [],
      synthesisMs: totalMs,
      persona: result.persona,
      ...(result.handoff ? { handoff: result.handoff } : {}),
    };
    return {
      answer: result.answer,
      sources: toAnswerSources(result.sources, result.persona),
      timing: { firstTokenMs: totalMs, totalMs },
      followUp: result.proposedQuestion ?? "",
      trace,
      error: result.error,
    };
  }

  // Single panel: brain + Maverick only (no handoff). Same brain/discovery path as multi
  // — the only difference is mode="single" suppresses the baton handoff. FAIRNESS INVARIANT.
  const result = await orchestrateEngagement(question, emptyDossier(), "single", orchDeps, opts.onToken);
  const totalMs = Date.now() - t0;

  if (!result.answer) {
    return {
      answer: "",
      sources: [],
      timing: { firstTokenMs: totalMs, totalMs },
      followUp: "",
      error: result.error,
    };
  }

  return {
    answer: result.answer,
    sources: toAnswerSources(result.sources, "agent"),
    timing: { firstTokenMs: totalMs, totalMs },
    followUp: result.proposedQuestion ?? "",
    error: result.error,
  };
}

