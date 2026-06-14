/**
 * @lab/autocorrect — eval-driven optimization loop (Karpathy AutoResearch).
 *
 * Pure decision core (loop.ts): given per-round judge metrics, decide
 * keep/rollback, detect overfit, diagnose weak dimensions, decide when to stop.
 * The orchestrator (orchestrator.ts) drives that core through injected,
 * app-agnostic seams (deploy / evaluate / propose) — the loop itself is portable
 * and knows nothing about Algolia.
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
export { runAutocorrect } from "./orchestrator.js";
export type {
  AutocorrectSeams,
  AutocorrectInput,
  AutocorrectResult,
} from "./orchestrator.js";
