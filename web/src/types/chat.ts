/**
 * Chat / panel data contracts for the 2×2 Answer-Quality Lab.
 *
 * Types here mirror the Phase-4 server output exactly so the UI renders all
 * four panels identically and the judge drawer is a pure mapping from server
 * payload → UI props.
 *
 * Server sources of truth (do not drift from these):
 *   answer.ts     → PanelAnswerResult (PanelDataResult here)
 *   liveJudge.ts  → LiveJudgeVerdict  (PanelJudgeResult here)
 *   panels.ts     → PanelId, Architecture, Retrieval, PanelMeta
 */

// ---------------------------------------------------------------------------
// Panel identity
// ---------------------------------------------------------------------------

/** The four panels in the 2×2 grid (row-major: P1 keyword-single, P2 keyword-multi,
 *  P3 neural-single, P4 neural-multi). */
export type PanelId = 'P1' | 'P2' | 'P3' | 'P4';

export type Architecture = 'single' | 'multi';
export type Retrieval = 'keyword' | 'neural';

/**
 * Lightweight panel descriptor used by UI components to render identity chips,
 * labels, and accentColors.  The full server-side PanelMeta (with agentId /
 * coordinator flag) lives in panels.ts; this is the browser-side projection.
 */
export interface Panel {
  /** Which panel this is. */
  id: PanelId;
  /** single-agent (P1/P3) or multi-agent Maverick coordinator (P2/P4). */
  arch: Architecture;
  /** keyword or neural retrieval. NOTE: neural indices currently run in keyword
   *  mode until the async neural flip is applied; `retrieval` is a tag only. */
  retrieval: Retrieval;
  /** The Algolia index this panel's retrieval targets (locked naming AC2_WWW_*). */
  indexName: string;
}

// ---------------------------------------------------------------------------
// Panel answer contract (mirrors answer.ts → PanelAnswerResult)
// ---------------------------------------------------------------------------

/** One retrieved source as the browser and judge consume it. */
export interface AnswerSource {
  /** Page/document title. */
  title: string;
  /** Canonical URL; may be empty for coordinator-synthesized hits. */
  url: string;
  /** Content-provenance tag, e.g. "agent" | "coordinator" | specialist name. */
  source: string;
}

/** Answer latency breakdown (best-effort; firstTokenMs === totalMs for non-streamed paths). */
export interface PanelTiming {
  /** ms to the first answer token. */
  firstTokenMs: number;
  /** ms for the full answer to complete. */
  totalMs: number;
}

/**
 * The Maverick orchestration trace — P2/P4 multi panels only.
 * The coordinator records which specialists fired, how many hits each found,
 * and how long synthesis took.  This is surfaced in the OrchestrationTrace
 * component; it is intentionally loosely typed here (the server emits it as
 * a JSON-serialisable object) so new fields don't require a web rebuild.
 */
export interface OrchestrationTrace {
  /** Entities / intent extracted from the question. */
  entities: string[];
  /** Which specialists were routed to and their per-specialist hit counts. */
  specialists: { name: string; fired: boolean; hits: number }[];
  /** ms for the synthesis LLM call. */
  synthesisMs: number;
  /** Any extra fields the coordinator adds over time. */
  [key: string]: unknown;
}

/**
 * One panel's answer payload — the unified contract that every panel (single or
 * multi) returns from /api/answer.  The UI renders all four identically.
 *
 * Mirrors answer.ts → PanelAnswerResult exactly.
 */
export interface PanelDataResult {
  answer: string;
  sources: AnswerSource[];
  timing: PanelTiming;
  /** The panel's generated follow-up question (identical SHARED block across all
   *  4 panels — the MULTI-TURN INVARIANT; only arch+retrieval differ). */
  followUp?: string;
  /** Multi panels (P2/P4) only — the Maverick orchestration trace. */
  trace?: OrchestrationTrace;
  /** Set when the panel errored; a populated `answer` may still be present. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Judge contract (mirrors liveJudge.ts → LiveJudgeVerdict + CrossPanelDeltas)
// ---------------------------------------------------------------------------

/** One per-judge result from the composite (Skeptic / Referee / Advocate). */
export interface PerJudgeResult {
  /** Judge temperament identifier. */
  role: 'skeptic' | 'referee' | 'advocate';
  /** Round-averaged composite score 0–10. */
  score: number;
  /** The judge's round-0 summary note (shown in the per-judge expander). */
  note: string;
}

/** Named 4-dimension breakdown (each 1–10, equal-weighted ×1 per the 2026-06-27 spec). */
export interface VerdictDims {
  /** Source-grounding score — the HARD FLOOR: ≤3 when gate trips. */
  grounding: number;
  /** Did it address every part of the question (the discovery signals). */
  coverage: number;
  /** For what it covered, did it go deep — mechanism, specifics, trade-offs. */
  depth: number;
  /** Did it answer THIS user's situation, not a generic version. */
  relevance: number;
}

/** A claim the Skeptic judge flagged as unsupported by the retrieved sources. */
export interface FlaggedClaim {
  /** The unsupported claim, quoted/paraphrased from the answer. */
  claim: string;
  /** Why no provided source backs it. */
  reason: string;
  /** Skeptic's certainty 0–1 that it is a real violation (per-claim signal). */
  certainty: number;
}

/**
 * Cross-panel deltas — the three numbers that ARE the 2×2 argument.
 *   multiLift  = multi − single within a retrieval row  (P2−P1 keyword, P4−P3 neural)
 *   neuralLift = neural − keyword within an arch column (P3−P1 single, P4−P2 multi)
 *   compound   = P4 − P1 (best vs baseline)
 * Each is undefined when the needed sibling panel was not judged in this request.
 *
 * Mirrors liveJudge.ts → CrossPanelDeltas exactly.
 */
export interface CrossPanelDeltas {
  multiLift?: { keyword?: number; neural?: number };
  neuralLift?: { single?: number; multi?: number };
  compound?: number;
}

/**
 * The full judge verdict for one panel, as the UI receives it from /api/judge.
 *
 * Mirrors liveJudge.ts → LiveJudgeVerdict exactly (same field names so the
 * server payload can be cast directly without a mapping step).
 */
export interface PanelJudgeResult {
  panelId: string;
  /** Per-temperament results (Skeptic / Referee / Advocate). Live tier: 1 entry. */
  perJudge: PerJudgeResult[];
  /** Named 4-dim breakdown (grounding / coverage / depth / relevance). */
  dims: VerdictDims;
  /** Final 0–10 composite after consensus + voted gate = gate × mean(4 dims). */
  composite: number;
  /** Stable pre-gate consensus (the reproducible quality metric). */
  preGateScore: number;
  /** True when the hard grounding floor fired (≥2/3 rounds voted unsupported). */
  gateTripped: boolean;
  /** True when the grounding signal is present but not a reproducible supermajority. */
  borderline: boolean;
  /** Claims the Skeptic flagged as unsupported — the "why" behind a gate trip. */
  flaggedClaims: FlaggedClaim[];
  /** Quality of the panel's generated follow-up (0–10, MULTI-TURN signal only). */
  followUpQuality?: number;
  /** Chief-synthesizer narrative; shown in the judge drawer. */
  rationale: string;
  /** Set if the panel could not be judged; other panels are unaffected. */
  error?: string;
}

/**
 * The full /api/judge response payload — per-panel verdicts + cross-panel deltas.
 *
 * `deltas` is present when ≥2 of the 2×2 panels (P1–P4) were judged together.
 */
export interface JudgeResult {
  rounds: number;
  panels: PanelJudgeResult[];
  deltas?: CrossPanelDeltas;
}

// ---------------------------------------------------------------------------
// Legacy (kept for any residual imports during the Phase 0→5 transition)
// ---------------------------------------------------------------------------

/** @deprecated Use PanelId instead (2026-06-18 refactor). */
export type ColumnId = PanelId;

/**
 * @deprecated Legacy message type from the old 3-panel Agent Studio chat UI.
 * Kept so ChatMessage.tsx / conversation.ts / useComparison.ts compile during
 * the Phase 0→5 transition while those files are dormant (not rendered).
 */
export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  isLoading?: boolean;
  refused?: boolean;
  sourceType?: string;
  sources?: Source[];
}

/**
 * @deprecated Legacy Agent Studio history entry (bare {role,content} pair sent
 * as prior turns). Kept so agentStudioClient.ts / conversation.ts compile.
 */
export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * @deprecated Legacy source shape from the old agent-column chat UI.
 * Kept so GroupedSources.tsx / sources.ts / judgeClient.ts compile.
 */
export interface Source {
  objectID?: string;
  id?: string;
  title?: string;
  doc_title?: string;
  url?: string;
  doc_url?: string;
  summary?: string;
  doc_summary?: string;
  chunk_text?: string;
  source_type?: string;
  position?: number;
}
