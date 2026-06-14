/**
 * Autocorrect — pure decision types.
 *
 * The loop optimizes ONE config (Case-3 "Our System") to beat a fixed floor
 * (Case-2 "Ask AI") on the stable judge metric, subject to zero reproducible
 * grounding violations. This file is provider- and harness-agnostic: it consumes
 * already-computed metrics (the orchestrator adapts the judge's ScoreSet into
 * these shapes) so every decision function is pure and unit-testable.
 *
 * Optimization signal = `meanScore` (the judge's stable meanPreGateScore averaged
 * over a split). Grounding is a CONSTRAINT, not part of the score (see
 * [[feedback-grounding-supermajority-vote]]): a kept config must have zero
 * reproducible gate trips.
 */

/** Per-panel aggregate over the questions of one split. */
export interface PanelMetrics {
  /** Panel id, e.g. "tuned" (ours) or "mirror" (floor). */
  readonly panelId: string;
  /** Mean of the judge's stable meanPreGateScore across the split's questions. */
  readonly meanScore: number;
  /** # questions whose grounding gate tripped (a reproducible violation). */
  readonly gatedCount: number;
  /** # questions flagged borderline (ambiguous, not capped). */
  readonly borderlineCount: number;
  /** Mean per-dimension score across the split, keyed by rubric dimensionId. */
  readonly dimensionMeans: Readonly<Record<string, number>>;
  /** How many questions contributed to these means. */
  readonly questionsScored: number;
}

/** Metrics for one config evaluated over one split. */
export interface SplitMetrics {
  readonly split: "dev" | "held-out";
  /** All panels scored on this split (must include ours + the floor). */
  readonly panels: readonly PanelMetrics[];
}

/** One round of the loop: the config variant tried + its measured metrics. */
export interface RoundResult {
  readonly round: number;
  /** Stable id/label of the config variant evaluated this round. */
  readonly configId: string;
  /** Dev-split metrics (always present — the loop optimizes on dev). */
  readonly dev: SplitMetrics;
  /** Held-out metrics (present only on rounds where we validate). */
  readonly heldOut?: SplitMetrics;
}

export interface LoopConfig {
  /** Panel id of the system under optimization (Case-3). */
  readonly oursPanelId: string;
  /** Panel id of the fixed quality floor (Case-2 Ask AI). */
  readonly floorPanelId: string;
  /** Held-out margin (ours - floor) required to declare a win. */
  readonly targetMargin: number;
  /** Consecutive validated rounds the win must hold. */
  readonly sustainRounds: number;
  /** Hard cap on rounds. */
  readonly maxRounds: number;
  /** Stop if best dev score hasn't improved for this many rounds. */
  readonly patience: number;
  /** Minimum dev improvement to count as "better" (anti-noise epsilon). */
  readonly minImprovement: number;
}

/** A diagnosed weak point: a rubric dimension and its mean score for ours. */
export interface WeakDimension {
  readonly dimensionId: string;
  readonly meanScore: number;
}

export type StopReason =
  | "won"
  | "max-rounds"
  | "patience-exhausted"
  | "running";

export interface KeepDecision {
  readonly keep: boolean;
  readonly reason:
    | "improved"
    | "no-improvement"
    | "grounding-regressed"
    | "overfit-held-out-regressed";
}
