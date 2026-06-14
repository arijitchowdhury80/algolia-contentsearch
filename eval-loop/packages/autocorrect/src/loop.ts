import type {
  KeepDecision,
  LoopConfig,
  PanelMetrics,
  RoundResult,
  SplitMetrics,
  StopReason,
  WeakDimension,
} from "./types.js";

/** Find a panel in a split by id; throws if the expected panel is absent. */
function panelOf(split: SplitMetrics, panelId: string): PanelMetrics {
  const p = split.panels.find((x) => x.panelId === panelId);
  if (!p) throw new Error(`panel "${panelId}" not found in ${split.split} split`);
  return p;
}

/** Margin = ours.meanScore - floor.meanScore on a split. Pure. */
export function splitMargin(split: SplitMetrics, cfg: LoopConfig): number {
  return panelOf(split, cfg.oursPanelId).meanScore - panelOf(split, cfg.floorPanelId).meanScore;
}

/** True iff ours has NO reproducible grounding violations on this split. */
function groundedOn(split: SplitMetrics, cfg: LoopConfig): boolean {
  return panelOf(split, cfg.oursPanelId).gatedCount === 0;
}

function oursDevScore(r: RoundResult, cfg: LoopConfig): number {
  return panelOf(r.dev, cfg.oursPanelId).meanScore;
}

/**
 * Keep-if-better, with grounding as a hard constraint and a held-out overfit
 * guard. Order of checks matters: a grounding regression rejects regardless of
 * score; then require a real (above-noise) dev gain; then reject overfits that
 * gained on dev but regressed on held-out. Pure.
 */
export function decideKeep(
  prev: RoundResult,
  next: RoundResult,
  cfg: LoopConfig,
): KeepDecision {
  // 1. Grounding is non-negotiable: a new reproducible violation kills the mutation.
  if (!groundedOn(next.dev, cfg)) {
    return { keep: false, reason: "grounding-regressed" };
  }
  // 2. Must beat the previous dev score by more than the noise floor.
  const improvement = oursDevScore(next, cfg) - oursDevScore(prev, cfg);
  if (improvement < cfg.minImprovement) {
    return { keep: false, reason: "no-improvement" };
  }
  // 3. Overfit guard: if both rounds were validated, a held-out regression
  //    means the gain didn't generalise — reject it.
  if (prev.heldOut && next.heldOut) {
    if (splitMargin(next.heldOut, cfg) < splitMargin(prev.heldOut, cfg)) {
      return { keep: false, reason: "overfit-held-out-regressed" };
    }
  }
  return { keep: true, reason: "improved" };
}

/**
 * Win = the last `sustainRounds` rounds were ALL validated on held-out, each
 * clearing the target margin, with ours grounded on held-out. Pure.
 */
export function isWin(history: readonly RoundResult[], cfg: LoopConfig): boolean {
  if (history.length < cfg.sustainRounds) return false;
  const tail = history.slice(-cfg.sustainRounds);
  return tail.every(
    (r) =>
      r.heldOut !== undefined &&
      groundedOn(r.heldOut, cfg) &&
      splitMargin(r.heldOut, cfg) >= cfg.targetMargin,
  );
}

/** Rounds elapsed since ours' best dev score was last improved. */
function staleRounds(history: readonly RoundResult[], cfg: LoopConfig): number {
  if (history.length === 0) return 0;
  let bestIdx = 0;
  let best = oursDevScore(history[0], cfg);
  for (let i = 1; i < history.length; i++) {
    const s = oursDevScore(history[i], cfg);
    if (s > best) {
      best = s;
      bestIdx = i;
    }
  }
  return history.length - 1 - bestIdx;
}

/**
 * Stopping decision. Priority: a win ends the loop; otherwise the hard round cap;
 * otherwise patience (no dev improvement for `patience` rounds); else keep going.
 * Pure.
 */
export function shouldStop(
  history: readonly RoundResult[],
  cfg: LoopConfig,
): StopReason {
  if (isWin(history, cfg)) return "won";
  if (history.length >= cfg.maxRounds) return "max-rounds";
  if (staleRounds(history, cfg) >= cfg.patience) return "patience-exhausted";
  return "running";
}

/**
 * Ours' weakest rubric dimensions on the dev split, worst first — the targets a
 * mutation should aim to improve. Pure.
 */
export function diagnoseWeakest(
  dev: SplitMetrics,
  cfg: LoopConfig,
  k: number,
): WeakDimension[] {
  const ours = panelOf(dev, cfg.oursPanelId);
  return Object.entries(ours.dimensionMeans)
    .map(([dimensionId, meanScore]) => ({ dimensionId, meanScore }))
    .sort((a, b) => a.meanScore - b.meanScore)
    .slice(0, k);
}
