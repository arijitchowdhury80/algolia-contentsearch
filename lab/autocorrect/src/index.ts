/**
 * @lab/autocorrect — eval-driven optimization loop (Karpathy AutoResearch).
 *
 * Pure decision core: given per-round judge metrics, decide keep/rollback,
 * detect overfit, diagnose weak dimensions, and decide when to stop. No I/O,
 * no LLM — the orchestrator wires the real judge/runTests/deploy behind these.
 */
export * from "./types.js";
export {
  splitMargin,
  decideKeep,
  isWin,
  shouldStop,
  diagnoseWeakest,
} from "./loop.js";
export { summarizeSplit, type ScoredPanelAnswer } from "./summarize.js";
